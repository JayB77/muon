import CallablePlugin from "./base/callable-plugin.js"
import {remoteApp, ipcMethod} from "./base/app-decorators.js"
import System from "./system.js";
import AppManager, { FindAvailableNodesOptions } from "./app-manager.js";
import GatewayInterface from "./gateway-Interface.js";
import BaseAppPlugin from "./base/base-app-plugin.js";
import {AppContext, AppDeploymentInfo, AppRequest, JsonPublicKey, MuonNodeInfo} from "../../common/types";
import NodeManagerPlugin from "./node-manager";
import DbSynchronizer from "./db-synchronizer";
import lodash from 'lodash';

export const IpcMethods = {
  ExecRemoteCall: "exec-remote-call",
  GetAppId: "get-app-id",
  GetAppContext: "get-app-context",
  GetAppOldestContext: "get-app-oldest-context",
  GetAppDeploymentInfo: "get-app-deployment-info",
  QueryAppAllContext: "query-app-all-context",
  IsDeploymentExcerpt: "is-deployment-excerpt",
  EnsureAppTssKeyExist: "ensure-app-tss-key-exist",
  FindNAvailablePartners: "find-n-available-partner",
  VerifyRequestSignature: "verify-req-sign",
  GetNodeLastContextTime: "get-node-last-ctx-time",
  IsDbSynced: "is-db-synced",
  GetNodesWithCommonSubnet: "get-nodes-with-common-subnet",
} as const;
type IpcKeys = keyof typeof IpcMethods;
export type CoreIpcMethod = typeof IpcMethods[IpcKeys];

@remoteApp
class CoreIpcHandlers extends CallablePlugin {

  get remoteCallPlugin() {
    return this.muon.getPlugin("remote-call");
  }

  get systemPlugin(): System {
    return this.muon.getPlugin("system");
  }

  get appManager(): AppManager {
    return this.muon.getPlugin("app-manager");
  }

  get nodeManager(): NodeManagerPlugin {
    return this.muon.getPlugin('node-manager');
  }

  @ipcMethod(IpcMethods.ExecRemoteCall)
  async __execRemoteCall({data, callerInfo}) {
    // console.log(`CoreIpcHandlers.__onRemoteCallForward`, data, callerInfo)
    const {method, params, options} = data;
    if(this.remoteCallPlugin.listenerCount(method) < 1){
      throw `Remote method [${method}] handler not defined`
    }
    return await this.remoteCallPlugin.handleCall(undefined, method, params, callerInfo, null)
  }

  @ipcMethod(IpcMethods.GetAppId)
  async __onGetAppId(data: {appName: string}): Promise<string> {
    const appId = this.muon.getAppIdByName(data.appName)
    return appId || "0";
  }

  /**
   * Return local app context
   * @param appName
   */
  @ipcMethod(IpcMethods.GetAppContext)
  async __getAppContext(params: {appName: string, seed: string}) {
    const {appName, seed} = params
    const appId = await this.muon.getAppIdByName(appName)
    if(appId === "0")
      return null;
    return await this.appManager.getAppContext(appId, seed)
  }

  /**
   * Return local app context
   * @param appName
   */
  @ipcMethod(IpcMethods.GetAppOldestContext)
  async __getAppOldestContext(params: {appName: string}) {
    const {appName} = params
    const appId = await this.muon.getAppIdByName(appName)
    if(appId === "0")
      return null;
    return await this.appManager.getAppOldestContext(appId)
  }

  /**
   * If app context not found locally, it's need to query muon network to find it.
   * @param appName
   */
  @ipcMethod(IpcMethods.QueryAppAllContext)
  async __queryAppAllContext(appName: string): Promise<AppContext[]> {
    const appId = await this.__onGetAppId({appName})
    if(appId === "0")
      return [];
    return await this.appManager.queryAndLoadAppContext(appId)
  }

  @ipcMethod(IpcMethods.IsDeploymentExcerpt)
  async __isDeploymentExcerpt(data: {appName: string, method: string}) {
    const gp: GatewayInterface = this.muon.getPlugin("gateway-interface")
    return gp.getActualHandlerMethod(data.appName, data.method) !== "default"
  }

  @ipcMethod(IpcMethods.EnsureAppTssKeyExist)
  async __ensureAppTssKeyExist(data: {appId: string, seed: string}) {
    const {appId, seed} = data;
    console.log(`CoreIpcHandler.__ensureAppTssKeyExist`, {appId})
    if(this.appManager.appHasTssKey(appId, seed))
      return true;
    const tssKey:JsonPublicKey|null = await this.appManager.queryAndLoadAppTssKey(appId, seed);
    return !!tssKey;
  }

  @ipcMethod(IpcMethods.FindNAvailablePartners)
  async __findNAvailablePartners(options: FindAvailableNodesOptions): Promise<string[]> {
    return await this.appManager.findNAvailablePartners(options)
  }

  @ipcMethod(IpcMethods.VerifyRequestSignature)
  async __verifyRequestSignature(request: AppRequest): Promise<boolean> {
    const {appId} = request
    const app: BaseAppPlugin = this.muon.getAppById(appId)
    if(!app)
      throw `app not found`
    return app.verifyRequestSignature(request);
  }

  @ipcMethod(IpcMethods.GetAppDeploymentInfo)
  async __getAppDeploymentInfo(data: {appId: string, seed: string}): Promise<AppDeploymentInfo> {
    const {appId, seed} = data
    return this.appManager.getAppDeploymentInfo(appId, seed)
  }

  @ipcMethod(IpcMethods.GetNodeLastContextTime)
  async __getNodeLastContextTime(nodeIndex: string): Promise<number|null> {
    const node: MuonNodeInfo = this.nodeManager.getNodeInfo(nodeIndex)!;
    if(!node)
      return null;
    return this.appManager.getNodeLastTimestamp(node);
  }

  @ipcMethod(IpcMethods.IsDbSynced)
  async __isDbSynced(): Promise<boolean> {
    const dbSync: DbSynchronizer = this.muon.getPlugin("db-synchronizer");
    return dbSync.isSynced();
  }

  @ipcMethod(IpcMethods.GetNodesWithCommonSubnet)
  async __getNodeSubnets():Promise<string[]> {
    const ctxPartners: string[][] = this.appManager.getNodeAllContexts(this.currentNodeInfo!)
      .map(ctx => ctx.party.partners);
    return lodash.uniq(lodash.flatten(ctxPartners))
  }
}

export default CoreIpcHandlers
