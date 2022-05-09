const {
  axios,
  toBaseUnit,
  soliditySha3,
  BN,
  BNSqrt,
  multiCall,
  groupBy,
  flatten
} = MuonAppUtils

const getTimestamp = () => Math.floor(Date.now() / 1000)

const APP_CONFIG = {
  chainId: 250
}

module.exports = {
  APP_NAME: 'spirit_permissionless_oracles_vwap_v2',
  APP_ID: 25,
  config: APP_CONFIG,
  // REMOTE_CALL_TIMEOUT: 60000,
  PRICE_TOLERANCE: '0.05',
  SCALE: new BN('1000000000000000000'),

  TOKEN: 'token',
  TOTAL_SUPPLY: 'totalSupply',
  PAIRS: 'pairs',
  stableExchanges: ['solidly'],

  graphUrl: {
    solidly: 'https://api.thegraph.com/subgraphs/name/shayanshiravani/solidly',
    spirit:
      'https://api.thegraph.com/subgraphs/name/shayanshiravani/spiritswap',
    uniswap: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswapv2',
    spooky:
      'https://api.thegraph.com/subgraphs/name/shayanshiravani/spookyswap',
    traderjoe: 'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange',
    sushi: {
      1: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange',
      137: 'https://api.thegraph.com/subgraphs/name/sushiswap/matic-exchange',
      42161:
        'https://api.thegraph.com/subgraphs/name/sushiswap/arbitrum-exchange',
      43114:
        'https://api.thegraph.com/subgraphs/name/sushiswap/avalanche-exchange',
      250: 'https://api.thegraph.com/subgraphs/name/sushiswap/fantom-exchange',
      56: 'https://api.thegraph.com/subgraphs/name/sushiswap/bsc-exchange'
    }
  },
  graphDeploymentId: {
    solidly: 'QmY4uUc7kjAC2sCbviZGoTwttbJ6dXezWELyrn9oebAr58',
    spirit: 'QmUptbhTmAVCUTNeK2afecQJ3DFLgk9m4dBerfpqkTEJvi',
    uniswap: 'Qmc7K8dKoadu1VcHfAV45pN4sPnwZcU2okV6cuU4B7qQp1',
    spooky: 'QmQnteZnJmshPHuUbYNxSCVTEyKunncwCUgYiyqEFQeDV7',
    traderjoe: 'QmW62QDNJriA73HeyDAwnEaFyDNLZc7o8m5ewSALDRedoM',
    sushi: {
      1: 'QmbxC2AYMvnTq6UBAvkAch6KUsRy3VaGHgt6s6c8nfa1hm',
      137: 'QmWANhcqU1Fn9UsGWCzNzcURPJM9f3egyz14GF7jxKFJQG',
      42161: 'QmeBQRHngJLJ2r84Vvp3mgKbgYXHmAqc3dWkXoywU9ze3d',
      43114: 'QmTbmXhUr67gAt5eLy5zUo7dRqATG8S8QgPEcdVhmenRNU',
      250: 'QmSpAjYK1DxDvVhiSKK3M7wV1yaukSuV6UzKhrSsrKvf53',
      56: 'QmeVMMA1rUfF5y93NmQuJDWbXCapNpw4kyUNretC62NRhA'
    }
  },

  VALID_CHAINS: ['250'],

  Info_ABI: [
    {
      inputs: [],
      name: 'getReserves',
      outputs: [
        { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
        { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
        { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'token0',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'token1',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'stable',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function'
    }
  ],

  ERC20_TOTAL_SUPPLY_ABI: [
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function'
    }
  ],
  ERC20_DECIMALS_ABI: [
    {
      inputs: [],
      name: 'decimals',
      outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
      stateMutability: 'view',
      type: 'function'
    }
  ],

  BASE_PAIR_METADATA: [
    {
      inputs: [],
      name: 'metadata',
      outputs: [
        { internalType: 'uint256', name: 'dec0', type: 'uint256' },
        { internalType: 'uint256', name: 'dec1', type: 'uint256' },
        { internalType: 'uint256', name: 'r0', type: 'uint256' },
        { internalType: 'uint256', name: 'r1', type: 'uint256' },
        { internalType: 'bool', name: 'st', type: 'bool' },
        { internalType: '', name: 't0', type: 'address' },
        { internalType: 'address', name: 't1', type: 'address' }
      ],
      stateMutability: 'view',
      type: 'function'
    }
  ],

  getTokenTxs: async function (pairAddr, graphUrl, deploymentID, start, end) {
    const currentTimestamp = getTimestamp()
    const timestamp_lt = end ? end : currentTimestamp
    const timestamp_gt = start ? start : currentTimestamp - 1800
    let skip = 0
    let tokenTxs = []
    let queryIndex = 0
    while (true) {
      queryIndex += 1
      let lastRowQuery =
        queryIndex === 1
          ? `
            swaps_last_rows:swaps(
              first: 1,
              where: {
                pair: "${pairAddr.toLowerCase()}"
              },
              orderBy: timestamp,
              orderDirection: desc
            ) {
              amount0In
              amount1In
              amount0Out
              amount1Out
              reserve0
              reserve1
              timestamp
            }
          `
          : ''
      const query = `
            {
              swaps(
                first: 1000,
                skip: ${skip},
                where: {
                  pair: "${pairAddr.toLowerCase()}",
                  timestamp_gt: ${timestamp_gt},
                  timestamp_lt: ${timestamp_lt}
                },
                orderBy: timestamp,
                orderDirection: desc
              ) {
                amount0In
                amount1In
                amount0Out
                amount1Out
                reserve0
                reserve1
                timestamp
              }
              ${lastRowQuery}
              _meta {
                deployment
              }
            }
          `
      skip += 1000
      try {
        const {
          data: { data },
          status
        } = await axios.post(graphUrl, {
          query: query
        })
        if (status == 200 && data) {
          const {
            swaps,
            _meta: { deployment }
          } = data
          if (deployment != deploymentID) {
            throw { message: 'SUBGRAPH_IS_UPDATED' }
          }
          if (!swaps.length) {
            if (queryIndex == 1) {
              tokenTxs = tokenTxs.concat(data.swaps_last_rows)
            }
            break
          }
          tokenTxs = tokenTxs.concat(swaps)
          if (skip > 5000) {
            currentTimestamp = swaps[swaps.length - 1]['timestamp']
            skip = 0
          }
        } else {
          throw { message: 'INVALID_SUBGRAPH_RESPONSE' }
        }
      } catch (error) {
        throw { message: `SUBGRAPH_QUERY_FAILED:${error.message}` }
      }
    }
    return tokenTxs
  },

  getReturnValue: function (info, methodName) {
    return info.find((item) => item.methodName === methodName)?.returnValues
  },

  getInfoContract: function (multiCallInfo, filterBy) {
    return multiCallInfo.filter((item) => item.reference.startsWith(filterBy))
  },

  makeCallContextDecimal: function (metadata, prefix) {
    let callContext = metadata.map((item) => [
      {
        reference: prefix + ':' + 't0' + ':' + item.t0,
        contractAddress: item.t0,
        abi: this.ERC20_DECIMALS_ABI,
        calls: [
          {
            reference: 't0' + ':' + item.t0,
            methodName: 'decimals'
          }
        ],
        context: {
          exchange: item.exchange,
          chainId: item.chainId
        }
      },
      {
        reference: prefix + ':' + 't1' + ':' + item.t1,
        contractAddress: item.t1,
        abi: this.ERC20_DECIMALS_ABI,
        calls: [
          {
            reference: 't1' + ':' + item.t1,
            methodName: 'decimals'
          }
        ],
        context: {
          exchange: item.exchange,
          chainId: item.chainId
        }
      }
    ])

    callContext = [].concat.apply([], callContext)
    return callContext
  },

  getFinalMetaData: function (resultDecimals, prevMetaData, prefix) {
    let metadata = prevMetaData.map((item) => {
      let t0 = this.getInfoContract(
        resultDecimals,
        prefix + ':' + 't0' + ':' + item.t0
      )
      let t1 = this.getInfoContract(
        resultDecimals,
        prefix + ':' + 't1' + ':' + item.t1
      )
      return {
        ...item,
        dec0: new BN(10)
          .pow(
            new BN(this.getReturnValue(t0[0].callsReturnContext, 'decimals')[0])
          )
          .toString(),
        dec1: new BN(10)
          .pow(
            new BN(this.getReturnValue(t1[0].callsReturnContext, 'decimals')[0])
          )
          .toString()
      }
    })
    return metadata
  },
  prepareTokenTx: async function (pair, exchange, start, end) {
    const tokenTxs = await this.getTokenTxs(
      pair,
      this.graphUrl[exchange],
      this.graphDeploymentId[exchange],
      start,
      end
    )

    return tokenTxs
  },

  tokenPrice: function (isStable, index, reserve0, reserve1) {
    let [reserveA, reserveB] =
      index == 0 ? [reserve0, reserve1] : [reserve1, reserve0]
    if (isStable) {
      let xy = this._k(reserve0, reserve1)
      let y = reserveB.sub(this._get_y(reserveA.add(this.SCALE), xy, reserveB))
      return y
    } else {
      return reserveB.mul(this.SCALE).div(reserveA)
    }
  },

  _k: function (x, y) {
    let _a = x.mul(y).div(this.SCALE) // xy
    let _b = x.mul(x).div(this.SCALE).add(y.mul(y).div(this.SCALE)) // x^2 + y^2
    return _a.mul(_b).div(this.SCALE) // xy(x^2 + y^2) = x^3(y) + y^3(x)
  },

  _get_y: function (x0, xy, y) {
    for (let i = 0; i < 255; i++) {
      let y_prev = y
      let k = this._f(x0, y)
      if (k.lt(xy)) {
        let dy = xy.sub(k).mul(this.SCALE).div(this._d(x0, y))
        y = y.add(dy)
      } else {
        let dy = k.sub(xy).mul(this.SCALE).div(this._d(x0, y))
        y = y.sub(dy)
      }
      if (y.gt(y_prev)) {
        if (y.sub(y_prev).lte(new BN('1'))) {
          return y
        }
      } else {
        if (y_prev.sub(y).lte(new BN('1'))) {
          return y
        }
      }
    }
  },

  _f: function (x0, y) {
    let x0y3 = x0
      .mul(y.mul(y).div(this.SCALE).mul(y).div(this.SCALE))
      .div(this.SCALE)
    let x03y = x0
      .mul(x0)
      .div(this.SCALE)
      .mul(x0)
      .div(this.SCALE)
      .mul(y)
      .div(this.SCALE)
    return x0y3.add(x03y)
  },

  _d: function (x0, y) {
    let y2 = y.mul(y).div(this.SCALE)
    let x03 = x0.mul(x0).div(this.SCALE).mul(x0).div(this.SCALE)

    return x0.mul(new BN('3')).mul(y2).div(this.SCALE).add(x03)
  },

  pairVWAP: async function (pair, index, exchange, isStable, start, end) {
    const tokenTxs = await this.prepareTokenTx(pair, exchange, start, end)
    if (tokenTxs) {
      let sumWeightedPrice = new BN('0')
      let sumVolume = new BN('0')
      for (let i = 0; i < tokenTxs.length; i++) {
        let swap = tokenTxs[i]
        if (
          (swap.amount0In != 0 && swap.amount1In != 0) ||
          (swap.amount0Out != 0 && swap.amount1Out != 0) ||
          (swap.amount0In != 0 && swap.amount0Out != 0) ||
          (swap.amount1In != 0 && swap.amount1Out != 0)
        ) {
          continue
        }
        let reserve0 = toBaseUnit(swap.reserve0, '18')
        let reserve1 = toBaseUnit(swap.reserve1, '18')
        let price = this.tokenPrice(isStable, index, reserve0, reserve1)
        let volume = new BN('0')
        switch (index) {
          case 0:
            if (swap.amount0In != 0) {
              volume = toBaseUnit(swap.amount0In, '18')
            } else {
              volume = toBaseUnit(swap.amount0Out, '18')
            }
            break
          case 1:
            if (swap.amount0In != 0) {
              volume = toBaseUnit(swap.amount1Out, '18')
            } else {
              volume = toBaseUnit(swap.amount1In, '18')
            }
            break
          default:
            break
        }
        sumWeightedPrice = sumWeightedPrice.add(price.mul(volume))
        sumVolume = sumVolume.add(volume)
      }
      if (sumVolume > new BN('0')) {
        let tokenPrice = sumWeightedPrice.div(sumVolume)
        return { pair, tokenPrice, sumVolume }
      }
      return { pair, tokenPrice: new BN('0'), sumVolume: new BN('0') }
    }
  },

  makeCallContextInfo: function (pair, prefix) {
    let calls = []
    let pairCache = []

    pair.forEach((item) => {
      if (!pairCache.includes(item.address)) {
        pairCache.push(item.address)
        const stableCall = this.stableExchanges.includes(item.exchange)
          ? [
              {
                reference: prefix + ':' + item.address,
                methodName: 'stable'
              }
            ]
          : []
        calls.push({
          reference: prefix + '_' + item.exchange + ':' + item.address,
          contractAddress: item.address,
          abi: this.Info_ABI,
          calls: [
            {
              reference: prefix + ':' + item.address,
              methodName: 'getReserves'
            },
            {
              reference: prefix + ':' + item.address,
              methodName: 'token0'
            },
            {
              reference: prefix + ':' + item.address,
              methodName: 'token1'
            },
            ...stableCall
          ],
          // TODO if it's possible remove pairIndex we need it in aggregate
          context: {
            // pairIndex: 0,
            pair: item.address,
            exchange: item.exchange,
            chainId: item.chainId
          }
        })
      }
    })

    return calls
  },

  prepareCallContext: function (token, pairs0, pairs1, chainId) {
    const contractCallContextToken = [
      {
        reference: this.TOKEN + '_' + ':' + token,
        contractAddress: token,
        abi: this.Info_ABI,
        calls: [
          {
            reference: this.TOKEN + ':' + token,
            methodName: 'getReserves'
          },
          {
            reference: this.TOKEN + ':' + token,
            methodName: 'token0'
          },
          {
            reference: this.TOKEN + ':' + token,
            methodName: 'token1'
          }
        ],
        context: {
          chainId: chainId
        }
      }
    ]
    const contractCallContextSupply = [
      {
        reference: this.TOTAL_SUPPLY,
        contractAddress: token,
        abi: this.ERC20_TOTAL_SUPPLY_ABI,
        calls: [
          {
            reference: this.TOTAL_SUPPLY,
            methodName: 'totalSupply'
          }
        ],
        context: {
          chainId: chainId
        }
      }
    ]

    const contractCallContextPairs = this.makeCallContextInfo(
      [...pairs0, ...pairs1],
      this.PAIRS
    )

    return [
      ...contractCallContextToken,
      ...contractCallContextSupply,
      ...contractCallContextPairs
    ]
  },

  runMultiCall: async function (contractCallContext) {
    let groupByChainId = groupBy(contractCallContext, 'context.chainId')

    let multiCallPromises = Object.keys(groupByChainId).map((chainId) =>
      multiCall(Number(chainId), groupByChainId[chainId])
    )
    let result = await Promise.all(multiCallPromises)
    return flatten(result)
  },

  getMetadata: function (multiCallInfo, filterBy) {
    const info = this.getInfoContract(multiCallInfo, filterBy)
    let metadata = info.map((item) => {
      const reserves = this.getReturnValue(
        item.callsReturnContext,
        'getReserves'
      )

      const stable = this.getReturnValue(item.callsReturnContext, 'stable')

      return {
        reference: item.reference,
        pair: item.context.pair,
        // pairIndex: item.context.pairIndex,
        exchange: item.context.exchange,
        chainId: item.context.chainId,
        r0: reserves[0],
        r1: reserves[1],

        t0: this.getReturnValue(item.callsReturnContext, 'token0')[0],
        t1: this.getReturnValue(item.callsReturnContext, 'token1')[0],
        stable: stable ? stable[0] : false
      }
    })
    return metadata
  },

  prepareData: async function (multiCallResult) {
    let metadata = this.getMetadata(multiCallResult, this.TOKEN)
    let pairsMetadata = this.getMetadata(multiCallResult, this.PAIRS)
    const callContextDecimalToken = this.makeCallContextDecimal(
      metadata,
      this.TOKEN
    )

    let callContextPairs = this.makeCallContextDecimal(
      pairsMetadata,
      this.PAIRS
    )

    const contractCallContextDecimal = [
      ...callContextDecimalToken,
      ...callContextPairs
    ]
    let resultDecimals = await this.runMultiCall(contractCallContextDecimal)

    metadata = this.getFinalMetaData(resultDecimals, metadata, this.TOKEN)[0]
    pairsMetadata = this.getFinalMetaData(
      resultDecimals,
      pairsMetadata,
      this.PAIRS
    )

    return { metadata, pairsMetadata }
  },

  prepareMetadataForTokenVWAP: async function (pairs) {
    const contractCallContext = this.makeCallContextInfo(pairs, this.PAIRS)
    let result = await this.runMultiCall(contractCallContext)

    let metadata = this.getMetadata(result, this.PAIRS)

    let callContextPairs = this.makeCallContextDecimal(metadata, this.PAIRS)
    let resultDecimals = await this.runMultiCall(callContextPairs)
    metadata = this.getFinalMetaData(resultDecimals, metadata, this.PAIRS)
    return metadata
  },

  preparePromisePair: function (token, pairs, metadata, start, end) {
    return this.makePromisePair(token, pairs, metadata, start, end)
  },
  makePromisePair: function (token, pairs, metadata, start, end) {
    let inputToken = token
    return pairs.map((pair) => {
      let currentMetadata = metadata.find(
        (item) =>
          item.reference ===
          this.PAIRS + '_' + pair.exchange + ':' + pair.address
      )
      let index =
        inputToken.toLowerCase() == currentMetadata.t0.toLowerCase() ? 0 : 1
      if (inputToken.toLowerCase() == currentMetadata.t0.toLowerCase()) {
        inputToken = currentMetadata.t1
      } else if (inputToken.toLowerCase() == currentMetadata.t1.toLowerCase()) {
        inputToken = currentMetadata.t0
      } else {
        throw { message: 'INVALID_PAIRS' }
      }
      return this.pairVWAP(
        pair.address,
        index,
        pair.exchange,
        currentMetadata.stable,
        start,
        end
      )
    })
  },
  calculatePriceToken: function (pairVWAPs, pairs) {
    let volume = pairVWAPs.reduce((previousValue, currentValue) => {
      return previousValue.add(currentValue.sumVolume)
    }, new BN(0))
    let price = pairVWAPs.reduce((price, currentValue) => {
      return price.mul(currentValue.tokenPrice).div(this.SCALE)
    }, new BN(this.SCALE))

    if (volume.toString() == '0' || price.toString() == '0') {
      throw { message: 'INVALID_PRICE' }
    }
    return { price, volume }
  },

  tokenVWAP: async function (token, pairs, metadata, start, end) {
    if (!metadata) {
      metadata = await this.prepareMetadataForTokenVWAP(pairs)
    }
    let pairVWAPPromises = this.preparePromisePair(
      token,
      pairs,
      metadata,
      start,
      end
    )

    pairVWAPPromises = flatten(pairVWAPPromises)
    let pairVWAPs = await Promise.all(pairVWAPPromises)
    let { price, volume } = this.calculatePriceToken(pairVWAPs, pairs)

    return { price, volume }
  },

  calculatePrice: function (
    reserveA,
    reserveB,
    pairs0,
    pairs1,
    _tokenVWAPResults,
    totalSupply
  ) {
    let sumVolume = new BN('0')

    let priceA, priceB
    priceA = priceB = new BN(this.SCALE)

    if (pairs0.length) {
      const { price, volume } = _tokenVWAPResults[0]
      sumVolume = sumVolume.add(volume)
      priceA = price
    }

    if (pairs1.length) {
      const { price, volume } = _tokenVWAPResults[1]
      sumVolume = sumVolume.add(volume)
      priceB = price
    }

    let sqrtK = BNSqrt(reserveA.mul(reserveB))
    let sqrtP = BNSqrt(priceA.mul(priceB))
    const fairPrice = sqrtK.mul(sqrtP).mul(new BN('2')).div(totalSupply)

    return { price: fairPrice, sumVolume }
  },

  LPTokenPrice: async function (token, pairs0, pairs1, chainId, start, end) {
    const contractCallContext = this.prepareCallContext(
      token,
      pairs0,
      pairs1,
      chainId
    )
    let result = await this.runMultiCall(contractCallContext)
    if (result) {
      const { metadata, pairsMetadata } = await this.prepareData(result)
      let totalSupply = this.getInfoContract(result, this.TOTAL_SUPPLY)[0]
        .callsReturnContext
      totalSupply = new BN(totalSupply[0].returnValues[0])

      let reserveA = new BN(metadata.r0)
        .mul(this.SCALE)
        .div(new BN(metadata.dec0))

      let reserveB = new BN(metadata.r1)
        .mul(this.SCALE)
        .div(new BN(metadata.dec1))

      let _tokenVWAPResults = await Promise.all([
        pairs0.length
          ? this.tokenVWAP(metadata.t0, pairs0, pairsMetadata, start, end)
          : null,
        pairs1.length
          ? this.tokenVWAP(metadata.t1, pairs1, pairsMetadata, start, end)
          : null
      ])

      const { price, sumVolume } = this.calculatePrice(
        reserveA,
        reserveB,
        pairs0,
        pairs1,
        _tokenVWAPResults,
        totalSupply
      )
      return {
        price: price.toString(),
        sumVolume
      }
    }
  },

  onRequest: async function (request) {
    let {
      method,
      data: { params }
    } = request

    switch (method) {
      case 'price':
        // Input validation or constraint
        let { token, pairs, hashTimestamp, chainId, start, end } = params
        // TODO do we need check valid chainId if yes whats the valid chain for aggregate
        if (chainId) {
          // if (!this.VALID_CHAINS.includes(chainId)) {
          //   throw { message: 'INVALID_CHAIN' }
          // }
          this.config = { ...this.config, chainId }
        }
        let { price, volume } = await this.tokenVWAP(
          token,
          pairs,
          null,
          start,
          end
        )
        return {
          token: token,
          tokenPrice: price.toString(),
          // pairs: pairs,
          volume: volume.toString(),
          ...(hashTimestamp ? { timestamp: request.data.timestamp } : {}),
          ...(chainId ? { chainId } : {}),
          ...(start ? { start } : {}),
          ...(end ? { end } : {})
        }
      case 'lp_price': {
        let { token, pairs0, pairs1, hashTimestamp, chainId, start, end } =
          params

        if (chainId) {
          // if (!this.VALID_CHAINS.includes(chainId)) {
          //   throw { message: 'INVALID_CHAIN' }
          // }
          this.config = { ...this.config, chainId }
        }
        // TODO :which will be send for pairs in sig array of address or obj
        const { price, sumVolume } = await this.LPTokenPrice(
          token,
          pairs0,
          pairs1,
          chainId,
          start,
          end
        )

        return {
          token: token,
          tokenPrice: price,
          // pairs0: pairs0,
          // pairs1: pairs1,
          volume: sumVolume.toString(),
          ...(hashTimestamp ? { timestamp: request.data.timestamp } : {}),
          ...(chainId ? { chainId } : {}),
          ...(start ? { start } : {}),
          ...(end ? { end } : {})
        }
      }

      default:
        throw { message: `Unknown method ${params}` }
    }
  },

  isPriceToleranceOk: function (price, expectedPrice) {
    let priceDiff = new BN(price).sub(new BN(expectedPrice)).abs()
    if (
      new BN(priceDiff)
        .div(new BN(expectedPrice))
        .gt(toBaseUnit(this.PRICE_TOLERANCE, '18'))
    ) {
      return false
    }
    return true
  },

  hashRequestResult: function (request, result) {
    let {
      method,
      data: { params }
    } = request
    let { hashTimestamp, hashVolume } = params
    switch (method) {
      // TODO set type of pairs based on sig

      case 'price': {
        if (
          !this.isPriceToleranceOk(
            result.tokenPrice,
            request.data.result.tokenPrice
          )
        ) {
          throw { message: 'Price threshold exceeded' }
        }
        let { token, chainId, start, end } = result

        return soliditySha3([
          { type: 'uint32', value: this.APP_ID },
          { type: 'address', value: token },
          // { type: 'address[]', value: pairs },
          ...(chainId ? [{ type: 'string', value: chainId }] : []),
          ...(start ? [{ type: 'uint256', value: start }] : []),
          ...(end ? [{ type: 'uint256', value: end }] : []),
          { type: 'uint256', value: request.data.result.tokenPrice },
          ...(hashVolume
            ? [{ type: 'uint256', value: request.data.result.volume }]
            : []),
          ...(hashTimestamp
            ? [{ type: 'uint256', value: request.data.timestamp }]
            : [])
        ])
      }
      case 'lp_price': {
        if (
          !this.isPriceToleranceOk(
            result.tokenPrice,
            request.data.result.tokenPrice
          )
        ) {
          throw { message: 'Price threshold exceeded' }
        }
        let { token, chainId, start, end } = result
        return soliditySha3([
          { type: 'uint32', value: this.APP_ID },
          { type: 'address', value: token },
          // { type: 'address[]', value: pairs0 },
          // { type: 'address[]', value: pairs1 },
          ...(chainId ? [{ type: 'string', value: chainId }] : []),
          ...(start ? [{ type: 'uint256', value: start }] : []),
          ...(end ? [{ type: 'uint256', value: end }] : []),
          { type: 'uint256', value: request.data.result.tokenPrice },
          ...(hashVolume
            ? [{ type: 'uint256', value: request.data.result.volume }]
            : []),
          ...(hashTimestamp
            ? [{ type: 'uint256', value: request.data.timestamp }]
            : [])
        ])
      }
      default:
        return null
    }
  }
}
