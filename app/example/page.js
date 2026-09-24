import {headers} from 'next/headers';
import {LANGUAGE_REQUEST_HEADER,normalizeLocale} from '@/lib/i18n/locale';
import {PublicExample} from '@/components/research/public-example';
const METADATA={es:{title:'Microsoft · Ejemplo de investigación',description:'Un caso histórico con fuente, puente de caja y preguntas de tesis. Sin cuenta ni precio objetivo.'},en:{title:'Microsoft · Research example',description:'A historical case with its source, cash bridge and thesis questions. No account and no target price.'}};
export function generateMetadata(){const copy=METADATA[normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER),'es')];return {...copy,alternates:{canonical:'/example',languages:{es:'/example?lang=es',en:'/example?lang=en'}}}}
export default function ExamplePage(){return <PublicExample language={normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER),'es')}/>}
