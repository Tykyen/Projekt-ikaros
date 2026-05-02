import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: UserSchemaClass.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
  ],
  exports: ['IUsersRepository', UsersService],
})
export class UsersModule {}
