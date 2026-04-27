import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";

// Placeholder — wire to your DB layer
export const userService = {
  async findById(id: string) {
    // TODO: query DB
    void id;
    throw new AppError("Not implemented", HTTP_STATUS.INTERNAL_SERVER_ERROR);
  },

  async findAll() {
    // TODO: query DB
    return [];
  },
};
