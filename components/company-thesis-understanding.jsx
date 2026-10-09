'use client';
import { useState } from 'react';
import styles from './company-thesis-workspace.module.css';
const questions = [
  { key: 'price', question: '¿Qué representa el crecimiento implícito?', choices: ['Una condición del modelo al mantener los demás supuestos', 'Una predicción del crecimiento que ocurrirá'], answer: 0, explanation: 'El mismo precio admite otras combinaciones de margen, reinversión y descuento. La solución inversa es condicionada.' },
  { key: 'decisive', question: '¿Qué identifica el supuesto decisivo?', choices: ['La hipótesis que más mueve el valor bajo los cambios ensayados', 'La hipótesis que tiene más probabilidades de cumplirse'], answer: 0, explanation: 'La sensibilidad mide el efecto del cambio elegido. No asigna probabilidades y el orden puede cambiar con el tamaño del ensayo.' },
  { key: 'portfolio', question: '¿Qué mide el efecto en cartera mostrado?', choices: ['El riesgo total de todas las posiciones', 'La contribución de esta empresa bajo un escenario y peso hipotéticos'], answer: 1, explanation: 'El resto de las posiciones y sus relaciones permanecen desconocidos. Esta atribución no calcula el riesgo total de cartera.' },
];
export default function CompanyThesisUnderstanding({ runId }) {
  const [answers, setAnswers] = useState({});
  return <section className={styles.understanding} aria-label="Comprobar comprensión" data-run-id={runId}>
    <h2>Comprueba tu interpretación antes de fijar la tesis</h2><p>Estas preguntas evalúan cómo lees el resultado. La calidad de la investigación depende de cerrar las brechas de evidencia y conservar criterios refutables.</p>
    {questions.map(q => <fieldset key={q.key}><legend>{q.question}</legend>{q.choices.map((choice, i) => <label key={choice}><input type="radio" name={`understanding-${q.key}`} checked={answers[q.key] === i} onChange={() => setAnswers(prior => ({ ...prior, [q.key]: i }))} />{choice}</label>)}{answers[q.key] !== undefined && <p role="status">{answers[q.key] === q.answer ? 'Interpretación compatible. ' : 'Revisa esta interpretación. '}{q.explanation}</p>}</fieldset>)}
  </section>;
}
