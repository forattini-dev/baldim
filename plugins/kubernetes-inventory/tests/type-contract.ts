import {
  KubernetesDriver,
  KubernetesInventoryPlugin,
  formatResourceTypeId,
  parseResourceTypeId,
  type KubernetesInventoryDriver,
  type KubernetesInventoryPluginOptions,
  type KubernetesResource,
} from '@baldim/plugin-kubernetes-inventory';

const options: KubernetesInventoryPluginOptions = {
  clusters: [{ id: 'production', context: 'production' }],
};

const plugin = new KubernetesInventoryPlugin(options);
void plugin.syncAll;
void KubernetesDriver;
void formatResourceTypeId;
void parseResourceTypeId;

declare const driver: KubernetesInventoryDriver;
declare const resource: KubernetesResource;
void driver;
void resource;
