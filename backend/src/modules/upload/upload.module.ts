import { Module, forwardRef } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  // 6.2b — Chat ↔ Upload je oboustranná závislost (UploadController používá
  // ChatService, ChatController nově používá UploadService). forwardRef
  // rozplete cyklus.
  imports: [forwardRef(() => ChatModule)],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
