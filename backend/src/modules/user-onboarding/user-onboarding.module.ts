import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  UserOnboardingSchema,
  UserOnboardingSchemaClass,
} from './schemas/user-onboarding.schema';
import { UserSchemaClass } from '../users/schemas/user.schema';
import { UserSchema } from '../users/schemas/user.schema';
import { UserOnboardingController } from './user-onboarding.controller';
import { UserOnboardingService } from './user-onboarding.service';

/** Spec 26.3 (D6) — persistence Vypravěče. User model jen read-only (createdAt → legacy flag). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserOnboardingSchemaClass.name, schema: UserOnboardingSchema },
      { name: UserSchemaClass.name, schema: UserSchema },
    ]),
  ],
  controllers: [UserOnboardingController],
  providers: [UserOnboardingService],
})
export class UserOnboardingModule {}
