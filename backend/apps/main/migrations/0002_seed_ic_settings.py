import json

from django.db import migrations


INITIAL_SETTINGS = json.loads(r'''[
  {
    "kind": "rx",
    "code": "cps4019",
    "name": "CPS4019",
    "model_number": "CPS4019",
    "mode": "curve",
    "axis": "power",
    "points": [
      [
        0.5,
        60
      ],
      [
        1,
        87.5
      ],
      [
        1.5,
        87
      ],
      [
        2,
        88.5
      ],
      [
        2.5,
        88
      ],
      [
        3,
        88
      ],
      [
        3.5,
        87
      ],
      [
        4,
        86
      ],
      [
        4.5,
        85
      ],
      [
        5,
        84
      ]
    ],
    "provisional": false,
    "source": "ConvenientPower CPS4019 Fig.3 (Vout=5V)"
  },
  {
    "kind": "rx",
    "code": "p9225",
    "name": "P9225-RAHGI8",
    "model_number": "P9225-RAHGI8",
    "mode": "curve",
    "axis": "current",
    "points": [
      [
        0,
        0
      ],
      [
        0.1,
        50
      ],
      [
        0.2,
        70
      ],
      [
        0.3,
        78
      ],
      [
        0.4,
        80
      ],
      [
        0.5,
        81
      ],
      [
        0.6,
        81.5
      ],
      [
        0.7,
        82
      ],
      [
        0.8,
        82
      ],
      [
        0.9,
        81.5
      ],
      [
        1,
        81
      ],
      [
        1.1,
        80.5
      ],
      [
        1.2,
        80
      ]
    ],
    "provisional": false,
    "source": "Renesas P9225 Fig.4 (Vout=5V)"
  },
  {
    "kind": "rx",
    "code": "cv8045d",
    "name": "CV8045D-05DB",
    "model_number": "CV8045D-05DB",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 85,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  },
  {
    "kind": "rx",
    "code": "ip6831",
    "name": "IP6831",
    "model_number": "IP6831",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 85,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  },
  {
    "kind": "charger",
    "code": "cps5201",
    "name": "CPS5201HRD",
    "model_number": "CPS5201HRD",
    "mode": "curve",
    "axis": "current",
    "points": [
      [
        0,
        60
      ],
      [
        0.1,
        94
      ],
      [
        0.2,
        95.5
      ],
      [
        0.3,
        95.8
      ],
      [
        0.4,
        95.5
      ],
      [
        0.6,
        94.8
      ],
      [
        0.9,
        93
      ]
    ],
    "provisional": false,
    "source": "ConvenientPower CPS5201 Charge Eff vs Charge Current (VBAT=3.6V)"
  },
  {
    "kind": "charger",
    "code": "ssp707a",
    "name": "SSP707A-V42L",
    "model_number": "SSP707A-V42L",
    "mode": "curve",
    "axis": "current",
    "points": [
      [
        0,
        65
      ],
      [
        0.1,
        96
      ],
      [
        0.2,
        96.5
      ],
      [
        0.4,
        95.5
      ],
      [
        0.8,
        94
      ],
      [
        1.2,
        92.5
      ],
      [
        1.4,
        91
      ]
    ],
    "provisional": false,
    "source": "SSP707A-V42L Charge Current vs Efficiency (4.2V)"
  },
  {
    "kind": "charger",
    "code": "mp2733",
    "name": "MP2733GQC-C04L",
    "model_number": "MP2733GQC-C04L",
    "mode": "curve",
    "axis": "current",
    "points": [
      [
        0,
        60
      ],
      [
        0.5,
        92.5
      ],
      [
        1,
        94
      ],
      [
        1.5,
        93.5
      ],
      [
        2,
        92
      ],
      [
        2.5,
        90.5
      ],
      [
        3,
        89
      ],
      [
        4,
        86
      ]
    ],
    "provisional": false,
    "source": "MPS MP2733GQC-C04L Charge Efficiency vs IBATT (VIN=5V)"
  },
  {
    "kind": "charger",
    "code": "sgm41518",
    "name": "SGM41518YG/TR",
    "model_number": "SGM41518YG/TR",
    "mode": "curve",
    "axis": "current",
    "points": [
      [
        0,
        0
      ],
      [
        0.1,
        78
      ],
      [
        0.2,
        86
      ],
      [
        0.3,
        89
      ],
      [
        0.4,
        90.5
      ],
      [
        0.5,
        91
      ],
      [
        0.6,
        91.5
      ],
      [
        0.8,
        92
      ],
      [
        1,
        92.5
      ],
      [
        1.26,
        93
      ]
    ],
    "provisional": false,
    "source": "SG Micro SGM41518 Charge Efficiency vs Charge Current (VBUS=5V)"
  },
  {
    "kind": "charger",
    "code": "max17330",
    "name": "MAX17330X22+",
    "model_number": "MAX17330X22+",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 80,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  },
  {
    "kind": "charger",
    "code": "bq25180",
    "name": "BQ25180YBGR",
    "model_number": "BQ25180YBGR",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 83,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  },
  {
    "kind": "charger",
    "code": "ip5528",
    "name": "IP5528",
    "model_number": "IP5528",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 90,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  },
  {
    "kind": "charger",
    "code": "fan54063",
    "name": "FAN54063UCX",
    "model_number": "FAN54063UCX",
    "mode": "fixed",
    "axis": "current",
    "points": [],
    "efficiency": 89,
    "provisional": true,
    "source": "原有暫定效率，待補原廠曲線"
  }
]''')


def seed_settings(apps, schema_editor):
    model = apps.get_model("main", "ICSetting")
    for row in INITIAL_SETTINGS:
        model.objects.using(schema_editor.connection.alias).get_or_create(code=row["code"], defaults=row)


class Migration(migrations.Migration):
    dependencies = [("main", "0001_initial")]
    operations = [migrations.RunPython(seed_settings, migrations.RunPython.noop)]

