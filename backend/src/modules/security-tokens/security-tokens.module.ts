import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SecurityTokenSchemaClass,
  SecurityTokenSchema,
} from './schemas/security-token.schema';
import { SecurityTokensService } from './security-tokens.service';
import { MongoSecurityTokensRepository } from './repositories/security-tokens.repository';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SecurityTokenSchemaClass.name, schema: SecurityTokenSchema },
    ]),
  ],
  providers: [
    SecurityTokensService,
    {
      provide: 'ISecurityTokensRepository',
      useClass: MongoSecurityTokensRepository,
    },
  ],
  exports: [SecurityTokensService],
})
export class SecurityTokensModule {}
