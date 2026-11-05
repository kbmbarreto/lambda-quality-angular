export const attachmentAccept = '.png,.jpg,.jpeg,.pdf,.txt,.csv';
export const attachmentFileError =
  'Selecione um arquivo não vazio PNG, JPEG, PDF, TXT ou CSV com até 10 MiB.';

// Shared by the library and evidence uploads. The server validates the bytes
// and its configured size limit; the client only checks the selected file.
export function prepareAttachment(file: File): File | null {
  const mime: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = mime[extension];
  if (
    !type ||
    (file.type &&
      !Object.values(mime).includes(file.type) &&
      !(extension === 'csv' && file.type === 'application/vnd.ms-excel')) ||
    !file.size ||
    file.size > 10 * 1048576
  )
    return null;
  return file.type === type ? file : new File([file], file.name, { type });
}
