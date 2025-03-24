import demoInterface from '@/assets/demo-interface.yaml'
import type {IInterfaceData, IInterface, IField} from '@/interfaces';
import YAML from 'yamljs';
import defaultInterfaceStructure from '@/assets/default-interface-structure.json';
import merge from 'ts-deepmerge';
import type {Ref} from 'vue';
import {isRef, toRaw} from 'vue';
import JSZip from 'jszip';

export const getParsedInterface = (data: IInterface = getInterface()): IInterfaceData => {
  let parseData: any = {};
  try {
    const json: IInterfaceData | string = YAML.parse(data.content) || {};
    if (typeof json === 'string') {
      return defaultInterfaceStructure as IInterfaceData;
    }
    const mergedInterface = merge(defaultInterfaceStructure as IInterfaceData, json);
    if (Object.keys(mergedInterface.locales).length === 0) {
      mergedInterface.locales = { 'en-US': 'English (US)' };
    }
    parseData = mergedInterface as IInterfaceData;
  } catch {
    parseData = defaultInterfaceStructure as IInterfaceData;
  }
  // @ts-expect-error process.env is parsed from backend
  const version = JSON.parse(process.env.APP_VERSION);
  parseData.global.copyright = (parseData.global.copyright || '').replace('{{version}}', version);

  // Check that all fields have required properties.
  const checkFields = (fields: {[key: string]: IField}): void => {
    Object.keys(fields).forEach(key => {
      const field = fields[key];
      if (field) {
        field.type = field.type ?? 'unknown';
        if (field.fields) {
          checkFields(field.fields);
        }
      }
    })
  }
  checkFields(parseData.sections);

  return parseData;
}

export const getInterface = (content: string = getDefaultInterfaceContent()): IInterface => {
  return {
    label: 'Untitled',
    hash: 'new',
    content,
    server_url: '',
    permission_interface: [],
    permission_admin: [],
    type: 'owner',
  }
}

export const getDefaultInterfaceContent = (): string => {
  return (demoInterface as string)
    .replace('[INTERFACE_EDITOR_URL]', window.location.origin);
}

export const parseFields = (fields: any = {}, locales = {}) => {
  fields = fields ? fields : {}; // Make sure it's an object

  const emptyStringTypes = ['i18n', 'wysiwyg', 'i18n:wysiwyg', 'markdown', 'i18n:markdown', 'date', 'i18n:date'];
  const multipleTypes = ['array', 'i18n:array'];
  const fileTypes = ['file', 'i18n:file', 'image', 'i18n:image', 'video', 'i18n:video'];
  const mayBeMultipleTypes = ['select', 'i18n:select', 'checkbox', 'i18n:checkbox', 'radio', 'i18n:radio'];
  const applyValues = (key: string) => {
    const type = fields[key].type || '';
    let value;
    if (multipleTypes.includes(type) || (mayBeMultipleTypes.includes(type) && !!(fields[key].multiple))) {
      value = [];
    } else if (fileTypes.includes(type)) {
      value = null;
    } else {
      value = emptyStringTypes.includes(type) ? '' : null;
    }
    return value;
  }

  const result: any = {};
  Object.entries(fields).forEach(([key, field]: any) => {
    result[key] = {};
    if (field.type?.includes('i18n')) {
      Object.entries(locales).forEach(([locale]) => {
        result[key][locale] = applyValues(key);
        if (result[key][locale] === undefined) {
          delete result[key][locale];
        }
      })
    } else {
      result[key] = applyValues(key);
    }
  });
  return result;
}

export const processObject = (obj: any, callback: (parent: any, key: string, path: string) => void, path = '', parent = null, parentKey: string | null = null) => {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const currentPath = path ? `${path}.${key}` : key;
        processObject(obj[key], callback, currentPath, obj, key);
      }
    }
  } else if (parentKey) {
    callback(parent, parentKey, path);
  }
}

export const getDataByPath = (obj: any, path = '') => {
  const keys = path.split(/\.|\[|\]/).filter(key => key);
  return keys.reduce((accumulator: any, key: string) => {
    if (accumulator !== null && accumulator !== undefined) {
      const index = Number(key);
      return Array.isArray(accumulator) && !isNaN(index) ? accumulator[index] : accumulator[key];
    }
    return undefined;
  }, obj);
}

export const getFieldByPath = (obj: any, path: string): any => {
  const keys = path.split(/\.|\[|\]/).filter(key => key); // Split by dot or brackets and filter out empty strings
  let current = obj;
  let lastFound = undefined;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // If it's the first key, just access it directly
    if (i === 0) {
      current = current[key];
    } else {
      // For subsequent keys, first check 'fields', then the key itself
      if (current && current.fields && current.fields[key] !== undefined) {
        lastFound = current; // Update last found object
        current = current.fields[key];
      } else {
        lastFound = current; // Update last found object
        current = current[key];
      }
    }

    // If current becomes undefined, we continue but keep track of last found
    if (current === undefined) {
      break;
    }
  }

  // If the last key was not found, return the last found object
  return current !== undefined ? current : lastFound;
}

export const objectsAreDifferent = (obj1: any | Ref<any>, obj2: any | Ref<any>, keys: string[] | null = null): boolean => {

  if (isRef(obj1) && isRef(obj2)) {
    return objectsAreDifferent(obj1.value, obj2.value);
  }

  if (obj1 === obj2) return false;

  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return true;
  }

  const keys1 = Object.keys(obj1).filter(key => obj1[key] !== undefined && (!keys || keys.includes(key)));
  const keys2 = Object.keys(obj2).filter(key => obj2[key] !== undefined && (!keys || keys.includes(key)));

  if (keys1.length !== keys2.length) {
    return true;
  }

  for (const key of keys1) {
    if (!keys2.includes(key)) {
      return true;
    }

    const value1 = obj1[key];
    const value2 = obj2[key];

    if (Array.isArray(value1) && Array.isArray(value2)) {
      if (value1.length !== value2.length) {
        return true;
      }
      for (let i = 0; i < value1.length; i++) {
        if (objectsAreDifferent(value1[i], value2[i])) {
          return true;
        }
      }
    } else if (objectsAreDifferent(value1, value2)) {
      return true;
    }
  }

  return false;
}

export const generateHash = (length = 10) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let hash = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    hash += characters[randomIndex];
  }
  return hash;
}

export const phpStringSizeToBytes = (sizeString: string) => {
  const size = parseFloat(sizeString);
  const unit = sizeString[sizeString.length - 1].toUpperCase();

  switch (unit) {
    case 'K':
      return size * 1024;
    case 'M':
      return size * 1024 * 1024
    case 'G':
      return size * 1024 * 1024 * 1024;
    case 'T':
      return size * 1024 * 1024 * 1024 * 1024;
    default:
      return size;
  }
}

export const deepToRaw = (obj: any): any => {
  const raw = toRaw(obj);
  if (Array.isArray(raw)) {
    return raw.map(item => deepToRaw(item));
  } else if (typeof raw === 'object' && raw !== null) {
    const result: any = {};
    for (const key in raw) {
      if (raw.hasOwnProperty(key)) {
        result[key] = deepToRaw(raw[key]);
      }
    }
    return result;
  }
  return raw;
}

export async function downloadFilesAsZip(urls: string[], jsonData: object, zipFileName: string): Promise<Blob> {
  return new Promise(async (resolve, reject) => {

    const zip = new JSZip();

    // Add JSON data as a file
    zip.file("data.json", JSON.stringify(jsonData, null, 2));

    // Fetch each URL and add it as a blob to the zip
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch ${url}: ${response.statusText}`);
          continue;
        }
        const blob = await response.blob();
        const fileName = url.split('/').pop() ?? 'file';
        zip.file(fileName, blob);
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
      }
    }

    // Generate the zip file
    try {
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      resolve(content);
    } catch (error) {
      reject(error);
    }
  })
}

export function loopThroughFields(
  fields: { [key: string]: IField },
  parsedUserData: any,
  callback: (field: IField, data: any) => void
): void {
  const loop = (items: { [key: string]: IField }, path = '') => {
    Object.keys(items).forEach(key => {
      const newPath = path === '' ? key : `${path}.${key}`;
      const field = getFieldByPath(fields, newPath.replace(/\[\d+\]/gm, ''));
      const data = getDataByPath(parsedUserData, newPath);

      // Check if field and data are defined before calling the callback
      if (field) {
        callback(field, data);
      }

      if (field?.fields) {
        if (field.type === 'array' && Array.isArray(data)) {
          data.forEach((item, index) => {
            loop(field.fields, `${newPath}[${index}]`);
          });
        } else {
          loop(field.fields, newPath);
        }
      }
    });
  };

  loop(fields);
}
