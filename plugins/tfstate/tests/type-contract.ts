import { TfStatePlugin } from '../src/index.js';
import {
  FilesystemTfStateDriver,
  S3TfStateDriver,
  TfStateDriver,
  type StateFileMetadata,
} from '../src/drivers.js';

const plugin = new TfStatePlugin({ driver: 'filesystem', config: { basePath: '.' } });
const base: TfStateDriver = new FilesystemTfStateDriver({ basePath: '.' });
const s3 = new S3TfStateDriver({ bucket: 'states', prefix: 'terraform/' });
const metadata: StateFileMetadata = { path: 'terraform.tfstate', lastModified: new Date() };

void plugin;
void base;
void s3;
void metadata;
