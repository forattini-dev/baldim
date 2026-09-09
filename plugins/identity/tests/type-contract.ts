import { IdentityPlugin, type IdentityPluginOptions } from '../src/index.js';
import { PasswordAuthDriver, ClientCredentialsAuthDriver } from '../src/drivers/index.js';

const options: IdentityPluginOptions = { issuer: 'https://identity.example.test' };
const plugin = new IdentityPlugin(options);
void plugin.getIntegrationMetadata;
void PasswordAuthDriver;
void ClientCredentialsAuthDriver;
