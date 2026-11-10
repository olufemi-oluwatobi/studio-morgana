# writes art/oxana-skulls-{front,back}.svg : layer #relief (raised silver) + #ink (engraved niello)
import sys
SK = ("M0,-113 C55,-113 92,-75 92,-17 C92,11 86,27 78,39 C74,47 70,57 70,69 L66,91 C64,105 52,113 40,113 "
      "L-40,113 C-52,113 -64,105 -66,91 L-70,69 C-70,57 -74,47 -78,39 C-86,27 -92,11 -92,-17 C-92,-75 -55,-113 0,-113 Z")
INK_FILL = ("M-62,-1 C-62,-23 -42,-33 -22,-29 C-6,-25 -4,-9 -8,7 C-12,25 -32,33 -46,27 C-58,22 -62,11 -62,-1 Z "
            "M62,-1 C62,-23 42,-33 22,-29 C6,-25 4,-9 8,7 C12,25 32,33 46,27 C58,22 62,11 62,-1 Z "
            "M0,25 C-8,37 -14,53 -8,61 L0,55 L8,61 C14,53 8,37 0,25 Z")
INK_STROKE = ("M-44,77 C-20,85 20,85 44,77 M-42,101 C-20,107 20,107 42,101 "
              + " ".join(f"M{x},{80 if abs(x)<30 else 78} L{x},{104 if abs(x)<30 else 100}" for x in (-36,-24,-12,0,12,24,36)) +
              " M-70,47 C-56,43 -44,49 -38,63 M70,47 C56,43 44,49 38,63"
              " M-56,-27 C-40,-41 -16,-39 -6,-27 M56,-27 C40,-41 16,-39 6,-27"
              " M12,-111 L6,-87 L18,-73 L8,-53"
              " M-80,-50 C-74,-70 -62,-86 -46,-96 M-86,-30 C-82,-52 -72,-70 -56,-84")
def bones():
    r = ""
    for a,b in (((-130,30),(130,170)),((130,30),(-130,170))):
        r += f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#fff" stroke-width="24" stroke-linecap="round"/>'
        for (x,y),(dx,dy) in ((a,(b[0]-a[0],b[1]-a[1])),(b,(a[0]-b[0],a[1]-b[1]))):
            L=(dx*dx+dy*dy)**.5; nx,ny=-dy/L,dx/L; ux,uy=-dx/L,-dy/L
            for s in (1,-1): r += f'<circle cx="{x+nx*13*s+ux*6:.1f}" cy="{y+ny*13*s+uy*6:.1f}" r="15" fill="#fff"/>'
    return r
def bone_ink():
    return ('<path d="M-104,48 L104,160 M104,48 L-104,160" stroke="#000" stroke-width="5" fill="none"/>')
def place(items, layer):
    out=[]
    for x,y,s,cb in items:
        t=f'translate({x},{y}) scale({s})'
        if layer=='relief':
            out.append(f'<g transform="{t}">{bones() if cb else ""}<path d="{SK}" fill="#fff"/></g>')
        elif layer=='eyes':
            out.append(f'<g transform="{t}"><path d="{INK_FILL.split(" Z ")[0]} Z {INK_FILL.split(" Z ")[1]} Z" fill="#000"/></g>')
        else:
            out.append(f'<g transform="{t}"><path d="{INK_FILL}" fill="#000"/><path d="{INK_STROKE}" fill="none" stroke="#000" stroke-width="{max(5,1.9/s):.1f}" stroke-linecap="round"/></g>')
    return "".join(out)
SETS = {
 'front': [(540,172,.44,False),(158,452,.28,False),(922,452,.28,False),(158,1196,.28,False),(922,1196,.28,False),(540,1520,.3,True)],
 'back':  [(540,172,.44,False),(540,530,.55,True),(540,1520,.3,True)],
}
for side,items in SETS.items():
    svg=(f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1669" viewBox="0 0 1080 1669">'
         f'<g id="relief">{place(items,"relief")}</g><g id="ink">{place(items,"ink")}</g><g id="eyes">{place(items,"eyes")}</g></svg>')
    open(f'{sys.argv[1]}/oxana-skulls-{side}.svg','w').write(svg)
print('ok')
