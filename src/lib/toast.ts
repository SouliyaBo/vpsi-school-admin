import { toast } from 'sonner';
import { conflictHint, errorMessage } from './error-message';

/**
 * Every toast in the app goes through here, so an API error is always rendered
 * the same way no matter which mutation raised it.
 */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },

  error(error: unknown, fallback?: string) {
    const message = fallback ?? errorMessage(error);
    toast.error(message, { description: fallback ? errorMessage(error) : conflictHint(error) });
  },

  info(message: string, description?: string) {
    toast.info(message, { description });
  },

  warning(message: string, description?: string) {
    toast.warning(message, { description });
  },
};

export { toast };
