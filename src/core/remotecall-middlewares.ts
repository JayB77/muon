import {MuonNodeInfo} from "../common/types";
import Muon from "./muon.js";
import {createAjv} from "../common/ajv.js";
import { stackTrace } from "../utils/helpers.js";

const ajv = createAjv();

export type CoreMiddlewareParams = {
  muon: Muon,
  method: string,
  options: any,
  callerInfo: MuonNodeInfo,
  args: any,
}

export type CoreRemoteCallMiddleware = (params: CoreMiddlewareParams) => any

export const onlyDeployers:CoreRemoteCallMiddleware = async (params: CoreMiddlewareParams) => {
  if(!params.callerInfo.isDeployer)
    throw `[${params.method}] remote method caller is not deployer`;
}

export function coreRemoteMethodSchema(schema):CoreRemoteCallMiddleware {
  if(!ajv.validateSchema(schema))
    throw {
      message: `invalid middleware input schema definition`, 
      errors: ajv.errors,
      stack: stackTrace()
    }
  return function (params: CoreMiddlewareParams) {
    const {args} = params;
    if(!ajv.validate(schema, args[0])){
      // @ts-ignore
      throw {
        message: [`remote call input params validation failed.`, ...ajv.errors!.map(e => e.message)].join("\n"),
        method: params.method
      };
    }
  }
}
