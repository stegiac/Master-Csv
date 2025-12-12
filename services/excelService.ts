
import * as XLSX from 'xlsx';

export const readExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const generateExcelExport = (data: any[], sourceData: any[], fileName: string) => {
  const workbook = XLSX.utils.book_new();
  
  // Sheet 1: Values
  const worksheetData = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheetData, 'Dati Export');

  // Sheet 2: Sources
  const worksheetSources = XLSX.utils.json_to_sheet(sourceData);
  XLSX.utils.book_append_sheet(workbook, worksheetSources, 'Fonti Dati');

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
