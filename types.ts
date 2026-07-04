
export interface ExtractedData {
  [key: string]: any;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  base64: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export enum ExtractionStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type PaymentStatus = 'Оплачен' | 'Не оплачено' | 'В процессе' | 'Не начат' | 'Отложено' | 'Отмена';

export interface Product {
  "№ Товара": string;
  "Наименование": string;
  "Кол-во товара": string | number;
  "Цена товара": string | number;
  "Сумма товара": string | number;
}

export interface RegistryRow {
  dbId: string;
  "№": string; // Номер счета
  "Контрагент": string;
  "БИН/ИИН": string;
  "Сметная стоимость": string;
  "Номер договора": string;
  "Сумма по договору": string | number;
  "Сумма к оплате": string | number;
  "Сумма НДС": string | number;
  "Сумма без НДС": string | number;
  "Примечание": string;
  "Комментарии ФД": string;
  "Статус": PaymentStatus;
  "Дата оплаты": string;
  "Дата загрузки": string;
  "Дата изменения": string;
  "Заявитель": string;
  "Товары": Product[];
  _fileId?: string;
  _fileName?: string;
  deletedAt?: string;
}
