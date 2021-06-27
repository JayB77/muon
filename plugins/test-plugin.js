const BaseService = require('./base/base-service-plugin')

class TestPlugin extends BaseService {
  APP_NAME = 'test'

  async onRequest(method, params){
    switch (method) {
      case "sign":
        return 1 + Math.random()
      default:
        return "test done"
    }
  }

  hashRequestResult(request, result){
    return Math.floor(result).toString();
  }
}

module.exports = TestPlugin;
