import Redis from 'ioredis';
import type { Bus } from './relay';

export class RedisBus implements Bus {
  private pub: Redis; private sub: Redis;
  constructor(url: string, private channel = 'kibar:rt') {
    // enableOfflineQueue:false → publish() échoue tout de suite si Redis est coupé (le relais retombe en local)
    this.pub = new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.sub = new Redis(url);
    for (const c of [this.pub, this.sub]) c.on('error', () => undefined); // reconnexion automatique, pas de crash
  }
  async publish(msg: string) { await this.pub.publish(this.channel, msg); }
  onMessage(cb: (msg: string) => void) {
    void this.sub.subscribe(this.channel).catch(() => undefined);
    this.sub.on('message', (_c, m) => cb(m));
  }
  close() { this.pub.disconnect(); this.sub.disconnect(); }
}
