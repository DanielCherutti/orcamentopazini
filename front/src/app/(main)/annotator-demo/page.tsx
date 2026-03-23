"use client";

import { useState } from 'react';
import { AdvancedImageAnnotator } from '@/components/annotator/advanced-image-annotator';
import type { ImageAnnotation } from '@/components/annotator/tools/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AnnotatorDemoPage() {
    const [annotations, setAnnotations] = useState<ImageAnnotation[]>([]);

    const demoImageUrl = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&h=600&fit=crop";

    const handleSave = async (newAnnotations: ImageAnnotation[], _composedBlob: Blob, _auto?: boolean, _viewport?: unknown) => {
        console.log('Salvando:', newAnnotations);
        setAnnotations(newAnnotations);
    };

    return (
        <div className="container mx-auto py-8">
            <Card>
                <CardHeader>
                    <CardTitle>Demo - Anotador</CardTitle>
                </CardHeader>
                <CardContent>
                    <AdvancedImageAnnotator
                        imageUrl={demoImageUrl}
                        initialAnnotations={annotations}
                        onSave={handleSave}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
