let router = require('express').Router();
const RequestLog = require('../../common/db-models/RequestLog')
const {QueueProducer} = require('../../common/message-bus')
let requestQueue = new QueueProducer(`gateway-requests`);
let {parseBool} = require('../../utils/helpers')
let soliditySha3 = require('../../utils/soliditySha3')
const CoreIpc = require('../../core/ipc')
const NetworkIpc = require('../../network/ipc')
const axios = require('axios').default
const crypto = require('../../utils/crypto')
const log = require('../../common/muon-log')('muon:gateway:api')

const SHIELD_FORWARD_URL = process.env.SHIELD_FORWARD_URL
const appIsShielded = (process.env.SHIELDED_APPS || "")
  .split('|')
  .reduce((acc, curr) => {
    acc[curr] = true
    return acc
  }, {});

async function storeRequestLog(logData) {
  let log = new RequestLog(logData)
  await log.save();
}

function extraLogs(req, result) {
  let logs = {
    time: Date.now(),
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress,
    extra: {
      referrer: req.get('Referer'),
      cra: req.connection.remoteAddress,
      sra: req.socket.remoteAddress,
      csra: req.connection.socket?.remoteAddress,
      headers: req.headers,
    }
  }
  if (result?.confirmed) {
    logs.extra = {
      ...logs.extra,
      nonce: result.data?.init?.nonceAddress,
      reqId: result.reqId
    }
  }
  return logs;
}

let cachedNetworkCheck = {
  time: 0,
  result: undefined
};
async function isCurrentNodeInNetwork() {
  /** check every 5 minute */
  if(Date.now() - cachedNetworkCheck.time > 5*60*1000) {
    cachedNetworkCheck.time = Date.now()
    cachedNetworkCheck.result = await NetworkIpc.isCurrentNodeInNetwork()
  }

  return cachedNetworkCheck.result;
}

const appTimeouts = {}
async function getAppTimeout(app) {
  if(appTimeouts[app] === undefined) {
    appTimeouts[app] = await CoreIpc.getAppTimeout(app);
  }
  return appTimeouts[app];
}

async function callProperNode(requestData) {
  if(await CoreIpc.isDeploymentExcerpt(requestData.app, requestData.method)) {
    log("Deployment excerpt method call %o", requestData)
    return await requestQueue.send(requestData)
  }

  let context = await CoreIpc.getAppContext(requestData.app);
  if (!context) {
    log("context not found. query the network for context.")
    try {
      context = await CoreIpc.queryAppContext(requestData.app)
    }catch (e) {
      log('query app context failed %o', e)
      throw e;
    }
  }
  if (!context) {
    log('app context not found and it throwing error %o', requestData)
    throw `App not deployed`;
  }
  const {partners} = context.party
  const currentNodeInfo = await NetworkIpc.getCurrentNodeInfo();
  if (partners.includes(currentNodeInfo.id)) {
    return await requestQueue.send(requestData)
  } else {
    const randomIndex = Math.floor(Math.random() * partners.length);
    log(`forwarding request to id:%s`, partners[randomIndex])
    const timeout = await getAppTimeout(requestData.app);
    let request = await NetworkIpc.forwardRequest(partners[randomIndex], requestData, timeout);
    // if(requestData.gwSign){
    //   const {hash: shieldHash} = await CoreIpc.shieldConfirmedRequest(request);
    //   const requestHash = soliditySha3(request.data.signParams)
    //   if(shieldHash !== requestHash)
    //     throw `Shield result mismatch.`
    //   request.gwAddress = process.env.SIGN_WALLET_ADDRESS;
    //   request.gwSignature = "";
    // }
    return request
  }
}

async function shieldConfirmedResult(requestData, request) {
  log(`Shield applying %o`, requestData)
  const {hash: shieldHash} = await CoreIpc.shieldConfirmedRequest(request);
  const requestHash = soliditySha3(request.data.signParams)
  if(shieldHash !== requestHash)
    throw `Shield result mismatch.`
  // request.gwAddress = process.env.SIGN_WALLET_ADDRESS;
  request.shieldSignature = crypto.sign(shieldHash);
}

router.use('/', async (req, res, next) => {
  let mixed = {
    ...req.query,
    ...req.body,
  }
  let {app, method, params = {}, nSign, mode = "sign", gwSign} = mixed

  if (!["sign", "view"].includes(mode)) {
    return res.json({success: false, error: {message: "Request mode is invalid"}})
  }

  gwSign = parseBool(gwSign);
  const requestData = {app, method, params, nSign, mode, gwSign}
  log("request arrived %o", requestData);

  if(!await isCurrentNodeInNetwork()){
    log("This node in not in the network.")
    if(!SHIELD_FORWARD_URL) {
      log("Env variable 'SHIELD_FORWARD_URL' not specified.")
      const appId = await CoreIpc.getAppId(app);
      return res.json({
        success: false,
        appId,
        error: {
          message: `Shield forward url (SHIELD_FORWARD_URL) not configured.`
        }
      })
    }
    if(!appIsShielded[app]) {
      log("This app is not shielded.")
      return res.json({success: false, error: {message: `The '${app}' app is neither shielded nor included in the network.`}});
    }
    log(`forwarding request to ${SHIELD_FORWARD_URL}`, requestData);
    const result = await axios.post(SHIELD_FORWARD_URL, requestData)
      .then(({data}) => data)
    if(result.success) {
      await shieldConfirmedResult(requestData, result.result)
    }
    return res.json(result);
  }
  else {
    callProperNode(requestData)
      .then(async result => {
        /** if request forwarded to other node */
        if(result.gwAddress !== process.env.SIGN_WALLET_ADDRESS) {
          if(appIsShielded[app]) {
            await shieldConfirmedResult(requestData, result)
          }
        }

        storeRequestLog({
          app,
          method,
          params,
          mode,
          gwSign,
          success: true,
          confirmed: result?.confirmed,
          errorMessage: result?.confirmed ? "" : "",
          ...extraLogs(req, result),
        });
        res.json({success: true, result})
      })
      .catch(async error => {
        if (typeof error === "string")
          error = {message: error}
        let appId
        try {
          appId = await CoreIpc.getAppId(app);
        } catch (e) {
          log("gateway.api error %o", e)
        }
        storeRequestLog({
          app,
          method,
          params,
          mode,
          gwSign,
          success: false,
          confirmed: false,
          errorMessage: error.message || error.error,
          ...extraLogs(req),
        });
        const {message, ...otherProps} = error;
        res.json({
          success: false,
          appId,
          error: {
            message: message || `Unknown error occurred`,
            ...otherProps
          }
        })
      })
  }
})

module.exports = router
