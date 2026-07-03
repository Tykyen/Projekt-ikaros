import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminTaskSchemaClass } from './schemas/admin-task.schema';
import type { AdminTask } from './interfaces/admin-task.interface';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { CreateAdminTaskDto } from './dto/create-admin-task.dto';
import type { UpdateAdminTaskDto } from './dto/update-admin-task.dto';

/**
 * 20.5 — úkoly týmu správy. Veřejné mezi adminy (list vrací všechny). Vlastní
 * úkol edituje každý admin; cizí smí upravit/smazat jen superadmin. Úkol
 * cizímu adminovi smí založit jen superadmin (`ownerId` override).
 */
@Injectable()
export class AdminTasksService {
  constructor(
    @InjectModel(AdminTaskSchemaClass.name)
    private readonly model: Model<AdminTaskSchemaClass>,
    private readonly usersService: UsersService,
  ) {}

  private toEntity(doc: Record<string, unknown>): AdminTask {
    return {
      id: String(doc._id),
      ownerId: doc.ownerId as string,
      ownerName: doc.ownerName as string,
      text: doc.text as string,
      done: (doc.done as boolean) ?? false,
      order: (doc.order as number) ?? 0,
      createdBy: doc.createdBy as string,
      createdAt: doc.createdAt as Date,
    };
  }

  async list(): Promise<AdminTask[]> {
    const docs = await this.model
      .find()
      .sort({ ownerId: 1, order: 1, createdAt: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async create(dto: CreateAdminTaskDto, user: RequestUser): Promise<AdminTask> {
    let ownerId = user.id;
    let ownerName = user.username;
    if (dto.ownerId && dto.ownerId !== user.id) {
      if (user.role !== UserRole.Superadmin) {
        throw new ForbiddenException({
          code: 'ADMIN_TASK_FORBIDDEN',
          message: 'Úkol cizímu adminovi smí zadat jen superadmin',
        });
      }
      const owner = await this.usersService.findById(dto.ownerId);
      ownerId = dto.ownerId;
      ownerName = owner.username;
    }
    const created = await this.model.create({
      ownerId,
      ownerName,
      text: dto.text.trim(),
      done: false,
      order: Date.now(),
      createdBy: user.id,
    });
    return this.toEntity(
      created.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    id: string,
    dto: UpdateAdminTaskDto,
    user: RequestUser,
  ): Promise<AdminTask> {
    const task = await this.model.findById(id).lean().exec();
    if (!task) {
      throw new NotFoundException({
        code: 'ADMIN_TASK_NOT_FOUND',
        message: 'Úkol neexistuje',
      });
    }
    this.assertCanEdit(task as unknown as Record<string, unknown>, user);
    const patch: Record<string, unknown> = {};
    if (dto.text !== undefined) patch.text = dto.text.trim();
    if (dto.done !== undefined) patch.done = dto.done;
    const updated = await this.model
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException({
        code: 'ADMIN_TASK_NOT_FOUND',
        message: 'Úkol neexistuje',
      });
    }
    return this.toEntity(updated as unknown as Record<string, unknown>);
  }

  async delete(id: string, user: RequestUser): Promise<void> {
    const task = await this.model.findById(id).lean().exec();
    if (!task) {
      throw new NotFoundException({
        code: 'ADMIN_TASK_NOT_FOUND',
        message: 'Úkol neexistuje',
      });
    }
    this.assertCanEdit(task as unknown as Record<string, unknown>, user);
    await this.model.findByIdAndDelete(id).exec();
  }

  private assertCanEdit(
    task: Record<string, unknown>,
    user: RequestUser,
  ): void {
    const ownerId = String(task.ownerId);
    if (user.role !== UserRole.Superadmin && ownerId !== user.id) {
      throw new ForbiddenException({
        code: 'ADMIN_TASK_FORBIDDEN',
        message: 'Cizí úkol smí upravit jen superadmin',
      });
    }
  }
}
