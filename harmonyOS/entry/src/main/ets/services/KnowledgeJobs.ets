import { AiClient } from './AiClient';
import { LocalStore, key } from './LocalStore';
import { PriorLesson } from '../model/CourseContext';
export class KnowledgeJobs {
  private static epoch: number = 0;
  private static clients: Map<string, AiClient> = new Map();
  private static chain: Promise<void> = Promise.resolve();
  static cancel(): void { KnowledgeJobs.epoch++; KnowledgeJobs.clients.forEach((client: AiClient) => client.cancel()); KnowledgeJobs.clients.clear(); }
  static schedule(store: LocalStore, materials: PriorLesson[], model: string, current: () => boolean, notify: () => void, includeVision: boolean = false): void {
    if (!store.cache.enabled('knowledge') || !materials.length) return;
    const epoch = KnowledgeJobs.epoch, valid = (): boolean => current() && epoch === KnowledgeJobs.epoch && store.cache.enabled('knowledge');
    const run = async (): Promise<void> => { let notified: boolean = false;
      for (const material of materials) {
        if (!valid()) return; if (material.gaps.length || !material.lines.length) continue;
        const id = key(store.dataFolder + ':' + material.course.subId + ':' + String(includeVision)); if (KnowledgeJobs.clients.has(id)) continue;
        const worker = new AiClient(); KnowledgeJobs.clients.set(id, worker);
        try { if (await worker.cachedKnowledge(store, material, includeVision) || !valid()) continue;
          if (!notified) { notify(); notified = true; }
          await worker.buildKnowledge(store, material, model, valid, includeVision);
        } catch (_) { /* Keep original material available; a later request can retry. */ }
        finally { worker.cancel(); if (KnowledgeJobs.clients.get(id) === worker) KnowledgeJobs.clients.delete(id); }
      }
    }; KnowledgeJobs.chain = KnowledgeJobs.chain.then(run).catch((): void => {});
  }
}
