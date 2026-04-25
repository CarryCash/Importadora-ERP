/**
 * Utility to validate Ecuadorian Identity Documents (Cédula and RUC)
 */

export const validateEcuadorianID = (id: string): { isValid: boolean; error?: string } => {
  if (!/^\d+$/.test(id)) {
    return { isValid: false, error: 'Debe contener solo números' };
  }

  if (id.length === 10) {
    return validateCedula(id);
  } else if (id.length === 13) {
    return validateRuc(id);
  } else {
    return { isValid: false, error: 'Longitud inválida (10 para Cédula, 13 para RUC)' };
  }
};

const validateCedula = (cedula: string): { isValid: boolean; error?: string } => {
  if (cedula.length !== 10) return { isValid: false, error: 'Cédula debe tener 10 dígitos' };

  const provincia = parseInt(cedula.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) {
    return { isValid: false, error: 'Código de provincia inválido' };
  }

  const tercerDigito = parseInt(cedula.substring(2, 3), 10);
  if (tercerDigito >= 6) {
    return { isValid: false, error: 'Tercer dígito inválido para cédula' };
  }

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const digitoVerificador = parseInt(cedula.substring(9, 10), 10);
  let suma = 0;

  for (let i = 0; i < coeficientes.length; i++) {
    let valor = parseInt(cedula.substring(i, i + 1), 10) * coeficientes[i];
    if (valor >= 10) valor -= 9;
    suma += valor;
  }

  const residuo = suma % 10;
  const resultado = residuo === 0 ? 0 : 10 - residuo;

  if (resultado !== digitoVerificador) {
    return { isValid: false, error: 'Dígito verificador incorrecto' };
  }

  return { isValid: true };
};

const validateRuc = (ruc: string): { isValid: boolean; error?: string } => {
  if (ruc.length !== 13) return { isValid: false, error: 'RUC debe tener 13 dígitos' };
  if (!ruc.endsWith('001')) return { isValid: false, error: 'RUC debe terminar en 001' };

  const provincia = parseInt(ruc.substring(0, 2), 10);
  if (provincia < 1 || provincia > 24) {
    return { isValid: false, error: 'Código de provincia inválido' };
  }

  const tercerDigito = parseInt(ruc.substring(2, 3), 10);

  if (tercerDigito < 6) {
    // Persona Natural
    return validateCedula(ruc.substring(0, 10));
  } else if (tercerDigito === 6) {
    // Entidad Pública
    const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
    const digitoVerificador = parseInt(ruc.substring(8, 9), 10);
    let suma = 0;
    for (let i = 0; i < coeficientes.length; i++) {
      suma += parseInt(ruc.substring(i, i + 1), 10) * coeficientes[i];
    }
    const residuo = 11 - (suma % 11);
    const resultado = (residuo === 11) ? 0 : residuo;
    return resultado === digitoVerificador ? { isValid: true } : { isValid: false, error: 'RUC Público inválido' };
  } else if (tercerDigito === 9) {
    // Persona Jurídica / Privada
    const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitoVerificador = parseInt(ruc.substring(9, 10), 10);
    let suma = 0;
    for (let i = 0; i < coeficientes.length; i++) {
      suma += parseInt(ruc.substring(i, i + 1), 10) * coeficientes[i];
    }
    const residuo = 11 - (suma % 11);
    const resultado = (residuo === 11) ? 0 : residuo;
    return resultado === digitoVerificador ? { isValid: true } : { isValid: false, error: 'RUC Jurídico inválido' };
  }

  return { isValid: false, error: 'Tercer dígito inválido' };
};
