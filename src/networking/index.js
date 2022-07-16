const Events = require('events-async');
const Libp2pBundle = require('../core/libp2p_bundle')
const bootstrap = require('./bootstrap')
const PeerId = require('peer-id')
const chalk = require('chalk')
const emoji = require('node-emoji')
const isPrivate = require('libp2p-utils/src/multiaddr/is-private')
const { fireEvent: fireCoreEvent } = require('../core/ipc')

class Network extends Events {
  configs
  libp2p
  _plugins = {}

  constructor(configs) {
    super()
    this.configs = configs;
  }

  async _initializeLibp2p() {
    let configs = this.configs.libp2p;
    let peerId = await PeerId.createFromJSON(configs.nodeId)
    let announceFilter = (multiaddrs) => multiaddrs.filter(m => !isPrivate(m));
    if (process.env.DISABLE_ANNOUNCE_FILTER)
      announceFilter = mas => mas

    const libp2p = await Libp2pBundle.create({
      peerId,
      addresses: {
        listen: [
          `/ip4/${configs.host}/tcp/${configs.port}`,
          // `/ip4/${configs.host}/tcp/${configs.port}/p2p/${process.env.PEER_ID}`,
          // `/ip4/0.0.0.0/tcp/${parseInt(configs.port)+1}/ws`,
        ],
        announceFilter
      },
      config: {
        peerDiscovery: {
          [Libp2pBundle.Bootstrap.tag]: {
            list: [...configs.bootstrap],
            interval: 5000, // default is 10 ms,
            enabled: configs.bootstrap.length > 0
          }
        }
      }
    });

    libp2p.connectionManager.on('peer:connect', this.onPeerConnect.bind(this))
    libp2p.connectionManager.on('peer:disconnect', this.onPeerDisconnect.bind(this))
    libp2p.on('peer:discovery', this.onPeerDiscovery.bind(this))

    this.peerId = peerId
    this.libp2p = libp2p
  }

  _initializePlugin() {
    const { plugins } = this.configs
    for (let pluginName in plugins) {
      let [plugin, configs] = plugins[pluginName]
      this._plugins[pluginName] = new plugin(this, configs)
      this._plugins[pluginName].onInit();
    }
    // console.log('plugins initialized.')
  }

  getPlugin(pluginName) {
    return this._plugins[pluginName]
  }

  async start() {
    console.log(
      emoji.get('moon'),
      chalk.green(` peer [${this.peerId.toB58String()}] starting ...`)
    )
    await this.libp2p.start()

    if (this.configs.libp2p.natIp) {
      let {port, natIp} = this.configs
      this.libp2p.addressManager.addObservedAddr(`/ip4/${natIp}/tcp/${port}/p2p/${this.peerId.toB58String()}`);
    }

    console.log(
      emoji.get('moon'),
      chalk.blue(' Node ready '),
      emoji.get('headphones'),
      chalk.blue(` Listening on: ${this.configs.libp2p.port}`)
    )

    // if(process.env.VERBOSE) {
    console.log("====================== Bindings ====================")
    this.libp2p.multiaddrs.forEach((ma) => {
      console.log(ma.toString())
      // console.log(`${ma.toString()}/p2p/${this.libp2p.peerId.toB58String()}`)
    })
    console.log("====================================================")
    // }

    if (this.libp2p.isStarted()) {
      this._onceStarted();
    } else {
      this.libp2p.once('start', this._onceStarted.bind(this))
    }
  }

  async _onceStarted() {
    console.log(`muon started at ${new Date()} (node-js version ${process.versions.node}).`)
    for (let pluginName in this._plugins) {
      this._plugins[pluginName].onStart()
    }
  }

  onPeerConnect(connection) {
    console.log(
      emoji.get('moon'),
      chalk.blue(' Node connected to '),
      emoji.get('large_blue_circle'),
      chalk.blue(` ${connection.remotePeer.toB58String()}`)
    )
    this.emit('peer:connect', connection.remotePeer)
    fireCoreEvent("peer:connect", connection.remotePeer.toB58String())
  }

  onPeerDisconnect(connection) {
    console.log(
      emoji.get('moon'),
      chalk.red(' Node disconnected'),
      emoji.get('large_blue_circle'),
      chalk.red(` ${connection.remotePeer.toB58String()}`)
    );
    this.emit('peer:disconnect', connection.remotePeer)
    fireCoreEvent("peer:disconnect", connection.remotePeer.toB58String())
  }

  async onPeerDiscovery(peerId) {
    this.emit('peer:discovery', peerId)
    fireCoreEvent("peer:discovery", peerId.toB58String())
    console.log('found peer');
    try {
      const peerInfo = await this.libp2p.peerRouting.findPeer(peerId)
      console.log({
        peerId: peerId.toB58String(),
        multiaddrs: peerInfo.multiaddrs,
        // peerInfo,
      })
    } catch (e) {
      console.log('Error Muon.onPeerDiscovery', e)
    }
  }
}

function getLibp2pBootstraps() {
  return Object.keys(process.env)
    .filter(key => key.startsWith('PEER_BOOTSTRAP_'))
    .map(key => process.env[key]);
}

async function start() {
  let {
    net,
    peerId,
    account,
    tss,
    ... otherConfigs
  } = await bootstrap();
  let configs = {
    libp2p: {
      nodeId: {
        id: process.env.PEER_ID,
        pubKey: process.env.PEER_PUBLIC_KEY,
        privKey: process.env.PEER_PRIVATE_KEY
      },
      natIp: process.env.PEER_NAT_IP,
      host: process.env.PEER_HOST || "0.0.0.0",
      port: process.env.PEER_PORT,
      bootstrap: getLibp2pBootstraps()
    },
    plugins: {
      'collateral': [require('./plugins/collateral-info'), {}],
      'remote-call': [require('./plugins/remote-call'), {}],
      'ipc': [require('./plugins/network-ipc-plugin'), {}],
      'ipc-handler': [require('./plugins/network-ipc-handler'), {}],
    },
    net,
    account,
    // TODO: pass it into the tss-plugin
    tss,
    ...otherConfigs,
  };
  const network = new Network(configs);
  await network._initializeLibp2p()
  await network._initializePlugin()
  await network.start();
}

module.exports = {
  start
}