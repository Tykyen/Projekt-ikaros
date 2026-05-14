import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import type { WeatherResult } from '../world-weather/interfaces/weather-generator.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class MapsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('map:join')
  handleJoin(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(sceneId);
  }

  @SubscribeMessage('map:leave')
  handleLeave(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.leave(sceneId);
  }

  @SubscribeMessage('map:token-moved')
  handleTokenMoved(
    @MessageBody() payload: { sceneId: string; token: unknown },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:token-moved', payload.token);
  }

  @SubscribeMessage('map:config-updated')
  handleConfigUpdated(
    @MessageBody() payload: { sceneId: string; config: unknown },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:config-updated', payload.config);
  }

  @SubscribeMessage('map:token-removed')
  handleTokenRemoved(
    @MessageBody() payload: { sceneId: string; tokenId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:token-removed', payload.tokenId);
  }

  @SubscribeMessage('map:reload-scene')
  handleReloadScene(
    @MessageBody() payload: { sceneId: string; scene: unknown },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:scene-reloaded', payload.scene);
  }

  @SubscribeMessage('map:scene-cleared')
  handleSceneCleared(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(sceneId).emit('map:scene-cleared');
  }

  @SubscribeMessage('map:ping')
  handlePing(
    @MessageBody()
    payload: { sceneId: string; x: number; y: number; userName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client
      .to(payload.sceneId)
      .emit('map:pinged', payload.x, payload.y, payload.userName);
  }

  @SubscribeMessage('map:effect-added')
  handleEffectAdded(
    @MessageBody() payload: { sceneId: string; effect: unknown },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:effect-added', payload.effect);
  }

  @SubscribeMessage('map:effect-removed')
  handleEffectRemoved(
    @MessageBody() payload: { sceneId: string; effectId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:effect-removed', payload.effectId);
  }

  @SubscribeMessage('map:fog-updated')
  handleFogUpdated(
    @MessageBody()
    payload: { sceneId: string; fogEnabled: boolean; revealedHexes: unknown[] },
    @ConnectedSocket() client: Socket,
  ): void {
    client
      .to(payload.sceneId)
      .emit('map:fog-updated', payload.fogEnabled, payload.revealedHexes);
  }

  @SubscribeMessage('map:dice-rolled')
  handleDiceRolled(
    @MessageBody() payload: { sceneId: string; [key: string]: unknown },
  ): void {
    const { sceneId, ...rest } = payload;
    this.server.to(sceneId).emit('map:dice-rolled', rest);
  }

  @SubscribeMessage('map:scene-state-changed')
  handleSceneStateChanged(
    @MessageBody()
    payload: { sceneId: string; isHidden: boolean; isLocked: boolean },
    @ConnectedSocket() client: Socket,
  ): void {
    client
      .to(payload.sceneId)
      .emit('map:scene-state-changed', payload.isHidden, payload.isLocked);
  }

  @SubscribeMessage('map:sound-changed')
  handleSoundChanged(
    @MessageBody() payload: { sceneId: string; soundIds: string[] },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:sound-changed', payload.soundIds);
  }

  @OnEvent('weather.updated')
  handleWeatherUpdated(payload: {
    worldId: string;
    generatorId: string;
    generatorName: string;
    weather: WeatherResult;
  }): void {
    this.server.to(`world:${payload.worldId}`).emit('weather:updated', payload);
  }
}
