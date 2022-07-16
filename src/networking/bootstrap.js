const mkdirp = require('mkdirp')

const getConfDir = () => {
  let baseDir = `@root/config/`
  return !!process.env.CONFIG_BASE_PATH ? baseDir + process.env.CONFIG_BASE_PATH : baseDir
}

const moduleExist = _module => {
  try{
    require.resolve(_module)
    return true
  }
  catch (e) {
    return false;
  }
}

async function bootstrap(){
  let configDir = getConfDir();
  mkdirp.sync(configDir);

  let net, tss;

  if(moduleExist(`@root/config/global/net.conf.json`)) {
    net = require('@root/config/global/net.conf.json')
  }
  else {
    net = require('@root/config/global/net.default.conf.json')
  }

  if(moduleExist(`${configDir}/tss.conf.json`)) {
    tss = require(`${configDir}/tss.conf.json`)
  }

  return {
    tss,
    net
  }
}

module.exports = bootstrap;