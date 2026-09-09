import { ReconPlugin, type ReconConfig } from '@baldin/plugin-recon';
import { DnsStage } from '@baldin/plugin-recon/stages';
import { TargetNormalizer } from '@baldin/plugin-recon/concerns';
import { UptimeBehavior } from '@baldin/plugin-recon/behaviors';
import { StorageManager } from '@baldin/plugin-recon/managers';

const config: ReconConfig = { behavior: 'passive', resources: { persist: false } };
void new ReconPlugin(config);
void DnsStage;
void TargetNormalizer;
void UptimeBehavior;
void StorageManager;
