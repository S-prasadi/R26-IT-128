import multer from "multer";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { normalizeMimeType } from "../utils/mime";

const ALLOWED_MIMETYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const normalizedMime = normalizeMimeType(file.mimetype);
  if (ALLOWED_MIMETYPES.includes(normalizedMime)) {
    file.mimetype = normalizedMime;
    cb(null, true);
  } else {
    cb(new AppError("Unsupported file type. Upload a PDF, DOCX, PNG, JPG, or TXT file.", HTTP_STATUS.BAD_REQUEST));
  }
};

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single("file");
