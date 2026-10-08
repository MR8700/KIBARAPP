import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';

/** Toute entrée invalide validée par zod → 400 lisible (au lieu d'un 500 générique). Aucune valeur saisie n'est renvoyée. */
@Catch(ZodError)
export class ZodFilter implements ExceptionFilter {
  catch(e: ZodError, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(400).json({ statusCode: 400, message: 'Requête invalide', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
}
