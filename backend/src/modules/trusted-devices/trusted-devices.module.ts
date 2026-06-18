import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TrustedDeviceSchemaClass,
  TrustedDeviceSchema,
} from './schemas/trusted-device.schema';
import { TrustedDevicesService } from './trusted-devices.service';
import { MongoTrustedDevicesRepository } from './repositories/trusted-devices.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrustedDeviceSchemaClass.name, schema: TrustedDeviceSchema },
    ]),
  ],
  providers: [
    TrustedDevicesService,
    {
      provide: 'ITrustedDevicesRepository',
      useClass: MongoTrustedDevicesRepository,
    },
  ],
  exports: [TrustedDevicesService],
})
export class TrustedDevicesModule {}
