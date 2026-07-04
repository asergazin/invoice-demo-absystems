
import React, { useRef } from 'react';
import { FileMetadata } from '../types';

interface FileUploaderProps {
  onFilesSelect: (files: FileMetadata[]) => void;
  isLoading: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelect, isLoading }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileMetadata[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const reader = new FileReader();
      
      const fileData = await new Promise<FileMetadata>((resolve) => {
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            type: file.type,
            previewUrl: URL.createObjectURL(file),
            base64: base64String,
            status: 'pending'
          });
        };
        reader.readAsDataURL(file);
      });
      newFiles.push(fileData);
    }
    
    onFilesSelect(newFiles);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <label 
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer bg-white transition-all hover:bg-slate-50 border-slate-300 ${isLoading ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400'}`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg className="w-10 h-10 mb-3 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
          </svg>
          <p className="mb-2 text-sm text-slate-500 font-medium text-center px-4">
            <span className="text-blue-600 font-bold">Выберите файлы</span> или перетащите их сюда
          </p>
          <p className="text-xs text-slate-400">PDF, JPG, PNG (до 10 файлов)</p>
        </div>
        <input 
          ref={inputRef}
          type="file" 
          className="hidden" 
          accept="application/pdf,image/jpeg,image/png"
          onChange={handleFileChange}
          multiple
          disabled={isLoading}
        />
      </label>
    </div>
  );
};
