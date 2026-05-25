import JSZip from "jszip";
import { formatDate } from "./dateformatter";
import { file } from "./types";

type downloader = {
  download: (file: file | file[]) => Promise<{ error: any }>;
  openInNewTab: (file: file | file[]) => Promise<{ error: any }>;
};

//does the download add the extension or I do that manually?
export function useDownloader(): downloader {
  async function download(file: file | file[]) {
    try {
      if (!file) throw "File is undefined";
      let name: string;
      let content: Blob;

      if (Array.isArray(file)) {
        const zip = new JSZip();
        file.forEach((f, i) => {
          //Names the zip file as `first shot date - last shot date`.
          i == 0 && (name = formatDate(f.date!));
          i == file.length - 1 && (name += " - " + formatDate(f.date!));

          zip.file(f.fileName, createBlob(f)); //I reckon this doesn't need the explicit Blob and even allows up to ArrayBufferLike (seen in ts doc)?
        });
        content = await zip.generateAsync({ type: "blob" });
      } else content = createBlob(file);

      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = Array.isArray(file) ? name! : file.fileName;
      a.click();
      URL.revokeObjectURL(url);

      return { error: null };
    } catch (e) {
      //set Error notification;
      console.error("Error in useDownloader ", e);
      return { error: "Error in useDownloader " + e };
    }
  }

  async function openInNewTab(file: file | file[]) {
    try {
      if (Array.isArray(file)) {
        file.forEach((f, i) => {
          setTimeout(() => {
            const content = createBlob(f);
            const url = URL.createObjectURL(content);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }, i * 100);
        });
      } else {
        const content = createBlob(file);
        const url = URL.createObjectURL(content);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      return { error: null };
    } catch (e) {
      //set error notification
      console.error("Error opening file(s): ", e);
      return { error: "Error in useDownloader " + e };
    }
  }

  return { download, openInNewTab };
}

function createBlob(file: file) {
  const { fileType: type, fileData: data } = file;

  if (data instanceof Uint8Array) {
    const buffer = Buffer.from(data);
    return new Blob([buffer], { type });
  }
  return new Blob([data], { type });
}
