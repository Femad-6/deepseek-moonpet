from pathlib import Path
import json, math, wave, struct
from PIL import Image, ImageDraw
repo = Path(__file__).resolve().parents[1]
def write_json(rel, value):
    (repo / rel).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# New programmatically drawn UI assets; no upstream artwork is copied or edited.
S = 3
ui = repo / 'assets/ui'
def card(name, blank=False):
    im = Image.new('RGBA', (1200*S,700*S),(0,0,0,0)); d=ImageDraw.Draw(im)
    box=(2*S,2*S,1198*S,698*S)
    d.rounded_rectangle(box, radius=42*S, fill=(255,255,255,248) if blank else (250,247,255,250), outline=(222,214,240,255),width=3*S)
    if not blank:
        d.line((62*S,48*S,1138*S,48*S),fill=(201,188,231,255),width=2*S)
    im.resize((1200,700),Image.Resampling.LANCZOS).save(ui/name)
card('dialog.png'); card('dialog-blank.png',True)
im=Image.new('RGBA',(96*S,96*S),(0,0,0,0));d=ImageDraw.Draw(im)
d.ellipse((3*S,3*S,93*S,93*S),fill=(44,36,62,245),outline=(216,200,244,255),width=2*S)
d.ellipse((23*S,19*S,72*S,72*S),fill=(235,220,255,255))
d.ellipse((41*S,12*S,82*S,57*S),fill=(44,36,62,255))
d.polygon([(71*S,63*S),(74*S,70*S),(82*S,73*S),(74*S,76*S),(71*S,83*S),(68*S,76*S),(61*S,73*S),(68*S,70*S)],fill=(240,208,224,255))
im.resize((96,96),Image.Resampling.LANCZOS).save(ui/'settings.png')
geometry={'image':{'width':1200,'height':700},'crop':{'x':0,'y':0,'w':1,'h':1},'inset':{'left':0.06,'right':0.06,'top':0.09,'bottom':0.07},'footer':{'heightRatio':0.42,'maxWidthRatio':0.9},'radius':12,'logoShare':1}
for name in ['dialog.json','dialog-blank.json']: write_json('assets/ui/'+name, geometry)
with wave.open(str(ui/'click.wav'),'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000)
    data=[]
    for i in range(2400):
        t=i/24000;env=math.sin(math.pi*i/2400)**2*math.exp(-t*35)
        data.append(struct.pack('<h',int(6500*env*math.sin(2*math.pi*880*t))))
    f.writeframes(b''.join(data))
print(repo.resolve())

