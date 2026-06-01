import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import type { CampaignRelationshipStatus } from '../interfaces/campaign-relationship.interface';

export class RelationshipSideDto {
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @IsString() behavior?: string;
  @IsOptional() @IsString() gmIntent?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(10) strength?: number;
  @IsOptional() @IsNumber() @Min(-3) @Max(3) valence?: number;
  @IsOptional() @IsString() emotionTag?: string;
}

export class CreateCampaignRelationshipDto {
  @IsString() subjectAId: string;
  @IsString() subjectBId: string;
  @IsOptional() @IsObject() shared?: {
    whatHappened?: string;
    behindTheScenes?: string;
  };
  @IsOptional() @IsObject() sideA?: RelationshipSideDto;
  @IsOptional() @IsObject() sideB?: RelationshipSideDto;
  @IsOptional()
  @IsIn(['active', 'dormant', 'crisis', 'closed'])
  status?: CampaignRelationshipStatus;
  @IsOptional() @IsNumber() @Min(1) @Max(5) priority?: number;
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsString() lastChangeNote?: string;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
