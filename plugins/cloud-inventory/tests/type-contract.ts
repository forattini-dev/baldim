import {
  CloudInventoryPlugin,
  type CloudDefinition,
  type CloudInventoryPluginOptions,
  type CloudResource,
  type SyncResult,
} from '@baldin/plugin-cloud-inventory';
import {
  AwsInventoryDriver,
  BaseCloudDriver,
  getDriver,
  type CloudProviderName,
} from '@baldin/plugin-cloud-inventory/drivers';

const cloud: CloudDefinition = {
  id: 'production',
  driver: 'aws',
  config: { regions: ['us-east-1'] },
};
const options: CloudInventoryPluginOptions = { clouds: [cloud] };
const plugin = new CloudInventoryPlugin(options);
const provider: CloudProviderName = 'aws';

void plugin.syncAll;
void AwsInventoryDriver;
void BaseCloudDriver;
void getDriver(provider);
declare const resource: CloudResource;
declare const result: SyncResult;
void resource;
void result;
