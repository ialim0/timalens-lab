"""Write samples/lecon_loi_ohm.pdf: a teacher's lesson (4e/3e, in French) to try the upload with.

    .venv/bin/python tools/make_sample_lesson.py
"""

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
FONT = Path("/usr/share/fonts/truetype/dejavu")

LESSON = [
    ("h1", "Chapitre 5 — La loi d'Ohm"),
    ("p", "Classe de 4e · Physique-chimie · Durée : 2 heures"),
    ("h2", "1. Rappels"),
    ("p", "La tension électrique U se mesure en volts (V) avec un voltmètre branché en dérivation "
          "aux bornes du dipôle. L'intensité du courant I se mesure en ampères (A) avec un ampèremètre "
          "branché en série. 1 A = 1000 mA."),
    ("p", "Un conducteur ohmique (on dit souvent « résistance ») est un dipôle qui s'oppose au passage "
          "du courant. Sa résistance R se mesure en ohms (Ω)."),
    ("h2", "2. Activité expérimentale"),
    ("p", "On réalise un circuit en série : un générateur de tension réglable, un conducteur ohmique "
          "R = 100 Ω et un ampèremètre. Un voltmètre est branché aux bornes du conducteur ohmique. "
          "On fait varier la tension du générateur et on relève U et I."),
    ("table", [("U (V)", "0", "2", "4", "6", "8"), ("I (mA)", "0", "20", "40", "60", "80")]),
    ("p", "On trace la caractéristique U = f(I). On obtient une droite qui passe par l'origine : "
          "U et I sont proportionnelles. Le coefficient directeur de la droite vaut 100 Ω, c'est la "
          "résistance R."),
    ("h2", "3. La loi d'Ohm"),
    ("box", "La tension U aux bornes d'un conducteur ohmique est égale au produit de sa résistance R "
            "par l'intensité I du courant qui le traverse :   U = R × I   (U en V, R en Ω, I en A)."),
    ("p", "On en déduit I = U / R et R = U / I. Attention aux unités : il faut convertir les mA en A "
          "avant de calculer."),
    ("p", "Exemple : un conducteur ohmique de 220 Ω est traversé par un courant de 30 mA. "
          "U = 220 × 0,030 = 6,6 V."),
    ("h2", "4. Protéger une DEL"),
    ("p", "Une diode électroluminescente (DEL) rouge supporte au plus 30 mA environ ; au-delà, elle "
          "grille. Elle ne s'allume que dans le sens passant, et il y a environ 2 V à ses bornes "
          "quand elle brille. On la protège en plaçant un conducteur ohmique en série avec elle : "
          "plus R est grande, plus l'intensité est faible."),
    ("h2", "5. Erreurs fréquentes"),
    ("li", "« Le courant s'use en traversant la résistance » : faux, dans un circuit en série "
           "l'intensité est la même partout."),
    ("li", "« Une grande résistance laisse passer plus de courant » : faux, à tension égale, plus R "
           "est grande, plus I est petite."),
    ("li", "Oublier de convertir les mA en A dans U = R × I."),
    ("h2", "6. Exercices"),
    ("li", "Exercice 1 — Calcule la tension aux bornes d'une résistance de 150 Ω traversée par 40 mA."),
    ("li", "Exercice 2 — Une pile de 9 V alimente une DEL rouge. Quelle résistance faut-il placer en "
           "série pour que l'intensité soit d'environ 20 mA ? (U aux bornes de la DEL : 2 V)"),
    ("li", "Exercice 3 — On double la tension aux bornes d'un conducteur ohmique. Que devient "
           "l'intensité ?"),
]


def main() -> None:
    pdf = FPDF(format="A4")
    pdf.set_margins(20, 18, 20)
    pdf.add_font("dv", "", str(FONT / "DejaVuSans.ttf"))
    pdf.add_font("dv", "B", str(FONT / "DejaVuSans-Bold.ttf"))
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    for kind, body in LESSON:
        if kind == "h1":
            pdf.set_font("dv", "B", 20); pdf.multi_cell(width, 10, body); pdf.ln(1)
        elif kind == "h2":
            pdf.ln(3); pdf.set_font("dv", "B", 13); pdf.multi_cell(width, 7, body); pdf.ln(1)
        elif kind == "p":
            pdf.set_font("dv", "", 11); pdf.multi_cell(width, 6, body); pdf.ln(2)
        elif kind == "li":
            pdf.set_font("dv", "", 11); pdf.multi_cell(width, 6, "•  " + body); pdf.ln(1)
        elif kind == "box":
            pdf.set_font("dv", "B", 11); pdf.set_fill_color(255, 238, 230)
            pdf.multi_cell(width, 7, body, border=1, fill=True, padding=3); pdf.ln(3)
        elif kind == "table":
            pdf.set_font("dv", "", 11)
            cell = width / len(body[0])
            for row in body:
                for value in row:
                    pdf.cell(cell, 8, value, border=1, align="C")
                pdf.ln()
            pdf.ln(3)
    out = ROOT / "samples" / "lecon_loi_ohm.pdf"
    pdf.output(str(out))
    print(out)


if __name__ == "__main__":
    main()
