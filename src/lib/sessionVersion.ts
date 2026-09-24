/**
 * Une session JWT reste techniquement valide 30 jours : sans ce controle, un
 * mot de passe reinitialise (souvent parce que le compte est compromis) ne
 * deconnecterait pas une session volee. `User.sessionVersion` est incremente
 * a chaque reinitialisation ; le JWT embarque la valeur du moment de la
 * connexion. Un JWT emis avant l'introduction du champ n'en porte pas : il
 * vaut 0, comme la valeur par defaut en base.
 */
export function sessionIsCurrent(userSessionVersion: number, tokenSessionVersion: number | undefined): boolean {
  return userSessionVersion === (tokenSessionVersion ?? 0);
}
