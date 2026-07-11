import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        // DUR (styl 43) — durabilita: potvrď zápis až po zápisu do žurnálu na
        // většinu uzlů. Na 1-node replSet (prod rs0) = w:1+journal; na skutečném
        // replSetu chrání před ztrátou při failoveru. Standalone dev = w:1.
        const writeConcern = { w: 'majority', j: true } as const;
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          if (config.get<string>('NODE_ENV') === 'production') {
            throw new Error(
              'MONGODB_URI musí být v production prostředí explicitně nastaven.',
            );
          }
          return { uri: 'mongodb://localhost:27017/ikaros', writeConcern };
        }
        return { uri, writeConcern };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
