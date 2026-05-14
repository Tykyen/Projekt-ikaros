import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          if (config.get<string>('NODE_ENV') === 'production') {
            throw new Error(
              'MONGODB_URI musí být v production prostředí explicitně nastaven.',
            );
          }
          return { uri: 'mongodb://localhost:27017/ikaros' };
        }
        return { uri };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
