export interface ChatAttachment {
  url: string;
  publicId: string;
  type: 'image' | 'video' | 'document';
  mimeType: string;
  filename: string;
  size: number;
}
