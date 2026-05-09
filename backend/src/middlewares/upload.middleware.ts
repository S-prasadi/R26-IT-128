import multer from "multer";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../constants/http";

const ALLOWED_MIMETYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
];

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Unsupported file type. Upload a PDF, PNG, JPG, or TXT file.", HTTP_STATUS.BAD_REQUEST));
  }
};

export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single("file");
