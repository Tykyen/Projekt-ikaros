import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushSubscriptionSchemaClass, PushSubscriptionSchema } from './schemas/push-subscription.schema';
import { MongoPushSubscriptionRepository } from './repositories/push-subscription.repository';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionSchemaClass.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [
    PushService,
    { provide: 'IPushSubscriptionRepository', useClass: MongoPushSubscriptionRepository },
  ],
  exports: [PushService],
})
export class PushModule {}
