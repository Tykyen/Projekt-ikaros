import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

@Controller('images')
export class ImagesController {
  private readonly cloudName: string;

  constructor(private readonly configService: ConfigService) {
    this.cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
  }

  @Get('*')
  redirect(@Req() req: Request, @Res() res: Response): void {
    const path = (req.params as Record<string, string>)[0];
    res.redirect(302, `https://res.cloudinary.com/${this.cloudName}/image/upload/${path}`);
  }
}
