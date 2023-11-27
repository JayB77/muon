import {Network} from "../../index.js";
import Events from 'events-async'
import {isPeerId, Libp2pPeer, Libp2pPeerInfo} from '../../types.js';
import {peerIdFromString} from '@libp2p/peer-id'
import {logger, Logger} from '@libp2p/logger'
import { multiaddr } from '@multiformats/multiaddr';
import {fromString as uint8ArrayFromString} from 'uint8arrays/from-string'
import {toString as uint8ArrayToString} from 'uint8arrays/to-string';
import {loadGlobalConfigs} from "../../../common/configurations.js";
import { NetConfigs } from "../../../common/types.js";

export default class BaseNetworkPlugin extends Events {
  network: Network;
  configs = {}
  protected defaultLogger: Logger;

  constructor(network: Network, configs){
    super()
    this.network = network
    this.configs = {...configs}
    this.defaultLogger = logger(`muon:network:plugin:${this.ConstructorName}`)
  }

  /**
   * Runs right after the plugin has been created.
   */
  async onInit(){

  }

  /**
   * Runs right after the plugin has been started
   */
  async onStart(){
  }

  get netConfigs():NetConfigs {
    return this.network.configs.net;
  }

  /**
   * Returns the PeerInfo object associated with the
   * specified peerId.
   * First, it looks for the peerId in the local peerStore.
   * If it is not found there, then it queries the
   * peerRouting (delegated nodes) for it.
   */
  async findPeer(peerId): Promise<Libp2pPeerInfo|null>{
    if(!isPeerId(peerId)) {
      try {
        peerId = peerIdFromString(peerId)
      }catch (e) {
        throw `Invalid string PeedID [${peerId}]: ${e.message}`;
      }
    }


    try {
      let peer: Libp2pPeer = await this.network.libp2p.peerStore.get(peerId)
        .catch(e => null)

      if (peer && peer.addresses.length && this.hasValidTimestamp(peer)) {
        this.defaultLogger(`peer found local %p`, peerId);
        return {
          id: peerId,
          multiaddrs: peer.addresses.map(addr => addr.multiaddr),
          protocols: []
        };
      }
      this.defaultLogger(`peer not found local %p`, peerId);
      let routingPeer = await this.network.libp2p.peerRouting.findPeer(peerId, {timeout: 5000});

      // There is a bug on libp2p 0.45.x
      // When a node dial another node, peer.addresses does not
      // save correctly on peerStore.
      // https://github.com/libp2p/js-libp2p/issues/1761
      //
      // We load addresses from peerRouting and patch the
      // peerStore
      
      try {
        //set timestamp on newly found peer
        const timestamp = Date.now();
        const uint8Array = uint8ArrayFromString(`${timestamp}`);

        this.network.libp2p.peerStore.patch(peerId, {
          multiaddrs: routingPeer.multiaddrs.map(x => multiaddr(x)),
          metadata: {timestamp: uint8Array}
        });
      } catch (e) {
        this.defaultLogger.error(`cannot patch peerStore, ${e.message}`);
      }

      return routingPeer;
    }
    catch (e) {
      // TODO: what to do?
      // this.defaultLogger("%o", e)
      this.defaultLogger('MUON_PEER_NOT_FOUND %o', peerId)
      return null;
    }
  }

  get peerId(){
    return this.network.peerId;
  }

  get ConstructorName() {
    let superClass = Object.getPrototypeOf(this);
    return superClass.constructor.name
  }

  hasValidTimestamp(peer) {
    const configs = loadGlobalConfigs('net.conf.json', 'default.net.conf.json');
    const peerStoreTTL = parseInt(configs.routing.peerStoreTTL);
    let timestamp = peer.metadata.get("timestamp");
    if (!timestamp)
      return false;
    timestamp = uint8ArrayToString(timestamp);
    if (Date.now() - timestamp > peerStoreTTL)
      return false;

    return true;
  }
}
