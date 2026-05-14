import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IkarosDiscussionSchemaClass,
  IkarosDiscussionSchema,
} from './schemas/ikaros-discussion.schema';
import {
  IkarosDiscussionPostSchemaClass,
  IkarosDiscussionPostSchema,
} from './schemas/ikaros-discussion-post.schema';
import { MongoIkarosDiscussionsRepository } from './repositories/ikaros-discussions.repository';
import { MongoIkarosDiscussionPostsRepository } from './repositories/ikaros-discussion-posts.repository';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { IkarosDiscussionsController } from './ikaros-discussions.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: IkarosDiscussionSchemaClass.name,
        schema: IkarosDiscussionSchema,
      },
      {
        name: IkarosDiscussionPostSchemaClass.name,
        schema: IkarosDiscussionPostSchema,
      },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [IkarosDiscussionsController],
  providers: [
    IkarosDiscussionsService,
    {
      provide: 'IIkarosDiscussionsRepository',
      useClass: MongoIkarosDiscussionsRepository,
    },
    {
      provide: 'IIkarosDiscussionPostsRepository',
      useClass: MongoIkarosDiscussionPostsRepository,
    },
    { provide: 'IkarosMessagesService', useExisting: IkarosMessagesService },
  ],
})
export class IkarosDiscussionsModule {}
