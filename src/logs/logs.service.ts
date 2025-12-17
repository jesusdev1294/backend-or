import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument } from './schemas/log.schema';

export interface CreateLogDto {
  service: string;
  action: string;
  status: string;
  request?: any;
  response?: any;
  metadata?: any;
  errorMessage?: string;
  duration?: number;
  orderId?: string;
  productSku?: string;
}

@Injectable()
export class LogsService {
  constructor(@InjectModel(Log.name) private logModel: Model<LogDocument>) {}

  async create(createLogDto: CreateLogDto): Promise<Log> {
    const log = new this.logModel(createLogDto);
    return log.save();
  }

  async findAll(filters?: {
    service?: string;
    action?: string;
    status?: string;
    orderId?: string;
    productSku?: string;
  }): Promise<Log[]> {
    const query = filters || {};
    return this.logModel.find(query).sort({ createdAt: -1 }).limit(100).exec();
  }

  async findById(id: string): Promise<Log> {
    return this.logModel.findById(id).exec();
  }

  async findByOrderId(orderId: string): Promise<Log[]> {
    return this.logModel.find({ orderId }).sort({ createdAt: -1 }).exec();
  }

  async findByProductSku(productSku: string): Promise<Log[]> {
    return this.logModel.find({ productSku }).sort({ createdAt: -1 }).exec();
  }
}
