import {headers} from 'next/headers';
import {LANGUAGE_REQUEST_HEADER,normalizeLocale} from '@/lib/i18n/locale';
import {PublicExample} from '@/components/research/public-example';
export const metadata={title:'Microsoft · Ejemplo de investigación',description:'Un caso histórico con fuente, puente de caja y preguntas de tesis. Sin cuenta ni precio objetivo.',alternates:{canonical:'/example'}};
export default function ExamplePage(){return <PublicExample language={normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER),'es')}/>}
