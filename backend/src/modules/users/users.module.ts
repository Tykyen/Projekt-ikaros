import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserSchemaClass.name, schema: UserSchema }])],
  providers: [{ provide: 'IUsersRepository', useClass: MongoUsersRepository }],
  exports: ['IUsersRepository'],
})
export class UsersModule {}
