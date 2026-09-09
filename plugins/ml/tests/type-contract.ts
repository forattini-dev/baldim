import MLPlugin, {
  BaseModel,
  ClassificationModel,
  NeuralNetworkModel,
  RegressionModel,
  TimeSeriesModel,
  type MLPluginOptions,
  type ModelConfig,
} from '@baldim/plugin-ml';

const config: ModelConfig = {
  type: 'regression',
  resource: 'samples',
  features: ['x'],
  target: 'y',
};
const options: MLPluginOptions = { models: { example: config } };
const plugin: MLPlugin = new MLPlugin(options);

void plugin;
void BaseModel;
void ClassificationModel;
void NeuralNetworkModel;
void RegressionModel;
void TimeSeriesModel;
