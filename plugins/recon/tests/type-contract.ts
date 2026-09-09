import { ReconPlugin, type ReconConfig } from '@baldim/plugin-recon';
import { DnsStage } from '@baldim/plugin-recon/stages';
import { TargetNormalizer } from '@baldim/plugin-recon/concerns';
import { UptimeBehavior } from '@baldim/plugin-recon/behaviors';
import { StorageManager } from '@baldim/plugin-recon/managers';

const config: ReconConfig = { behavior: 'passive', resources: { persist: false } };
void new ReconPlugin(config);
void DnsStage;
void TargetNormalizer;
void UptimeBehavior;
void StorageManager;
