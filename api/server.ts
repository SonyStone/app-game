import { RedisClient } from 'bun';
import { memoryBus, redisBus } from '../packages/paint-live/src/buses';
import { createLiveServer } from '../packages/paint-live/src/server';

/**
 * The live drawing relay on Vercel: one Bun Function serving WebSockets at `/api/server` (see `createLiveServer`).
 * Connections of one room may reach different instances, so rooms go through Redis when the project has it, as
 * `REDIS_URL` (or `KV_URL`) from Upstash for Redis in the Vercel Marketplace; without it each instance keeps its rooms
 * in memory, which works only while a room's connections share an instance.
 */
const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL;

Bun.serve(
  createLiveServer(
    redisUrl ? redisBus({ commands: new RedisClient(redisUrl), subscriber: new RedisClient(redisUrl) }) : memoryBus()
  )
);
