const BigNumber = require('bignumber.js');
const { axios, soliditySha3, ethCall } = MuonAppUtils

const SYNCHRONIZER_SERVER = 'https://oracle1.deus.finance'

const ACTIONS = {
    close: 0,
    sell: 0,
    open: 1,
    buy: 1
}

const CHAINS = {
    mainnet: 1,
    rinkeby: 4,
    polygon: 137,
    xdai: 100,
    bsc: 56,
    fantom: 250,
    heco: 128
}

module.exports = {
    APP_NAME: 'synchronizer',
    APP_ID: 9,

    onRequest: async function (request) {
        let {
            method,
            nSign,
            data: { params }
        } = request

        switch (method) {
            case 'signature':
                let { tokenId, action, chain, useMultiplier } = params

                const tokens = await axios
                    .get(`${SYNCHRONIZER_SERVER}/${chain}/signatures.json`)
                    .then(({ data }) => data)

                if (!(tokenId in tokens)) {
                    throw { message: 'Unknown token address' }
                }

                const token = tokens[tokenId]

                let multiplier = 0;

                return {
                    multiplier: multiplier,
                    price: token.price,
                    fee: token.fee,
                    address: tokenId,
                    expireBlock: token.blockNo,
                    action: action,
                    chain: chain
                }

            default:
                throw { message: `Unknown method ${params}` }
        }
    },

    hashRequestResult: function (request, result) {
        let {
            method,
            data: { params }
        } = request
        switch (method) {
            case 'signature': {
                let { multiplier, price, fee, address, expireBlock, action, chain } = result
                const abi = [
                    // { type: 'uint256', value: String(multiplier) },
                    { type: 'address', value: String(address) },
                    { type: 'uint256', value: String(price) },
                    { type: 'uint256', value: String(fee) },
                    { type: 'uint256', value: String(expireBlock) },
                    { type: 'uint256', value: String(ACTIONS[action]) },
                    { type: 'uint256', value: String(CHAINS[chain]) },
                    { type: 'uint8', value: this.APP_ID }
                ]
                return soliditySha3(abi)
            }
            default:
                return null
        }
    }
}